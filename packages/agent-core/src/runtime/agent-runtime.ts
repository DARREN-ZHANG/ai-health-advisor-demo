import type { AgentRequest } from '../types/agent-request';
import type { AgentResponseEnvelope, AgentTaskType } from '@health-advisor/shared';
import { AgentTaskType as AT } from '@health-advisor/shared';
import type { ContextBuilderDeps } from '../context/context-types';
import type { HealthAgent } from '../executor/create-agent';
import type { PromptLoader } from '../prompts/prompt-loader';
import type { FallbackEngine, FallbackLookupKey } from '../fallback/fallback-engine';
import type { AgentContext } from '../types/agent-context';
import { buildAgentContext } from '../context/context-builder';
import { evaluateHomepageRules } from '../rules/homepage-rules';
import { evaluateViewSummaryRules } from '../rules/view-summary-rules';
import type { RuleEvaluationResult } from '../rules/types';
import { buildSystemPrompt } from '../prompts/system-builder';
import { buildTaskPrompt } from '../prompts/task-builder';
import { parseAgentResponse } from '../output/response-parser';
import { validateChartTokens } from '../output/token-validator';
import { cleanSafetyIssues } from '../output/safety-cleaner';
import { withTimeout, TimeoutError } from './timeout-controller';
import { AGENT_SLA_TIMEOUT_MS } from '../constants/limits';
import { buildTaskContextPacket } from '../context/context-packet-builder';
import type { TaskContextPacket } from '../context/context-packet';

export interface AgentRuntimeDeps extends ContextBuilderDeps {
  agent: HealthAgent;
  promptLoader: PromptLoader;
  fallbackEngine: FallbackEngine;
}

/**
 * Runtime observer 回调接口，用于测试/eval 追踪。
 * 所有回调均为可选，observer 抛错不得影响生产执行。
 */
export interface AgentRuntimeObserver {
  onContextBuilt?(context: AgentContext): void;
  onRulesEvaluated?(rules: RuleEvaluationResult): void;
  onPacketBuilt?(packet: TaskContextPacket): void;
  onPromptBuilt?(input: { systemPrompt: string; taskPrompt: string }): void;
  onModelOutput?(raw: string): void;
  onParsed?(envelope: AgentResponseEnvelope): void;
  onFallback?(reason: 'low_data' | 'invalid_output' | 'timeout' | 'provider_error'): void;
}

/**
 * 安全执行 observer 回调，observer 抛错不影响生产流程。
 */
function tryNotify(fn: (() => void) | undefined): void {
  if (!fn) return;
  try {
    fn();
  } catch {
    // observer 抛错不得影响生产执行
  }
}

/**
 * Agent Runtime 总入口。
 * backend 通过 executeAgent(request, runtimeDeps) 单一调用即可完成 AI 分析。
 */
export async function executeAgent(
  request: AgentRequest,
  deps: AgentRuntimeDeps,
  timeoutMs: number = AGENT_SLA_TIMEOUT_MS,
  observer?: AgentRuntimeObserver,
): Promise<AgentResponseEnvelope> {
  const fallbackKey: FallbackLookupKey = {
    profileId: request.profileId,
    pageContext: request.pageContext,
    tab: request.tab,
  };

  try {
    // 1. 构建 Agent 上下文
    const context = buildAgentContext(request, deps);
    tryNotify(() => observer?.onContextBuilt?.(context));

    // 2. low-data 快速 fallback：数据不足时跳过 LLM 调用
    if (context.signals.lowData) {
      tryNotify(() => observer?.onFallback?.('low_data'));
      return toLowDataFallback(deps.fallbackEngine, request.taskType, fallbackKey);
    }

    // 3. 执行规则引擎
    const rulesResult = evaluateRules(context);
    tryNotify(() => observer?.onRulesEvaluated?.(rulesResult));

    // 4. 构建 TaskContextPacket
    const packet = buildTaskContextPacket(context, rulesResult);
    tryNotify(() => observer?.onPacketBuilt?.(packet));

    // 5. 构建 prompts（传入 packet）
    const systemPrompt = buildSystemPrompt(context, deps.promptLoader, packet.missingData);
    const taskPrompt = buildTaskPrompt(context, deps.promptLoader, rulesResult, packet);
    tryNotify(() => observer?.onPromptBuilt?.({ systemPrompt, taskPrompt }));

    // 6. 带超时调用 LLM，超时时通过 AbortSignal 真正中断底层调用
    const raw = await withTimeout(
      (signal) => deps.agent.invoke({ systemPrompt, userPrompt: taskPrompt, signal }),
      timeoutMs,
    );
    tryNotify(() => observer?.onModelOutput?.(raw.content));

    // 7. 解析结构化输出
    const parseResult = parseAgentResponse(raw.content, {
      taskType: request.taskType,
      pageContext: request.pageContext,
      defaultStatusColor: toEnvelopeStatusColor(rulesResult.statusColor),
    });

    if (!parseResult.success) {
      tryNotify(() => observer?.onFallback?.('invalid_output'));
      return toFallback(deps.fallbackEngine, request.taskType, fallbackKey);
    }

    // 8. 校验 chart tokens（只能来自 visibleCharts 或 suggestedChartTokens）
    const allowedTokens = new Set([
      ...packet.visibleCharts.map((vc) => vc.chartToken),
      ...(packet.homepage?.suggestedChartTokens ?? []),
      ...(packet.viewSummary?.suggestedChartTokens ?? []),
    ]);
    const tokenResult = validateChartTokens(
      parseResult.envelope.chartTokens,
      Array.from(allowedTokens),
    );
    const safeEnvelope: AgentResponseEnvelope = {
      ...parseResult.envelope,
      chartTokens: tokenResult.valid,
    };

    // 9. Safety clean
    const cleaned = cleanSafetyIssues(
      safeEnvelope.summary,
      context.dataWindow.missingFields,
      safeEnvelope.microTips,
    );

    const result: AgentResponseEnvelope = {
      ...safeEnvelope,
      summary: cleaned.cleaned,
      microTips: cleaned.cleanedTips,
      meta: {
        ...safeEnvelope.meta,
        finishReason: 'complete',
      },
    };

    // 10. 写回 session memory
    writeSessionMemory(deps, request, result.summary);

    // 11. 写回 analytical memory
    writeAnalyticalMemory(deps, request, context, result.summary, rulesResult);

    tryNotify(() => observer?.onParsed?.(result));

    return result;
  } catch (error) {
    if (error instanceof TimeoutError) {
      tryNotify(() => observer?.onFallback?.('timeout'));
      return toTimeoutFallback(deps.fallbackEngine, request.taskType, fallbackKey);
    }
    tryNotify(() => observer?.onFallback?.('provider_error'));
    return toFallback(deps.fallbackEngine, request.taskType, fallbackKey);
  }
}

function evaluateRules(context: AgentContext): RuleEvaluationResult {
  switch (context.task.type) {
    case AT.HOMEPAGE_SUMMARY:
      return evaluateHomepageRules(context);
    case AT.VIEW_SUMMARY:
      return evaluateViewSummaryRules(context);
    default:
      return {
        insights: [],
        suggestedChartTokens: [],
        suggestedMicroTips: [],
        statusColor: 'green',
      };
  }
}

function writeSessionMemory(
  deps: AgentRuntimeDeps,
  request: AgentRequest,
  assistantSummary: string,
): void {
  const now = Date.now();

  if (request.userMessage) {
    deps.sessionMemory.appendMessage(request.sessionId, request.profileId, {
      role: 'user',
      text: request.userMessage,
      createdAt: now,
    });
  }

  deps.sessionMemory.appendMessage(request.sessionId, request.profileId, {
    role: 'assistant',
    text: assistantSummary,
    createdAt: now + 1,
  });
}

function writeAnalyticalMemory(
  deps: AgentRuntimeDeps,
  request: AgentRequest,
  context: AgentContext,
  summary: string,
  rulesResult: RuleEvaluationResult,
): void {
  const { sessionId, profileId, taskType } = request;

  switch (taskType) {
    case AT.HOMEPAGE_SUMMARY:
      deps.analyticalMemory.setHomepageBrief(sessionId, profileId, summary);
      break;
    case AT.VIEW_SUMMARY: {
      const scope = context.task.tab && context.task.timeframe
        ? `${context.task.tab}:${context.task.timeframe}`
        : undefined;
      if (scope) {
        deps.analyticalMemory.setViewSummary(sessionId, profileId, scope, summary);
      }
      break;
    }
  }

  if (rulesResult.insights.length > 0) {
    deps.analyticalMemory.setRuleSummary(
      sessionId,
      profileId,
      rulesResult.insights.map((i) => i.message).join('; '),
    );
  }
}

function toFallback(
  engine: FallbackEngine,
  taskType: AgentTaskType,
  key: FallbackLookupKey,
): AgentResponseEnvelope {
  return engine.getFallback(taskType, key);
}

function toTimeoutFallback(
  engine: FallbackEngine,
  taskType: AgentTaskType,
  key: FallbackLookupKey,
): AgentResponseEnvelope {
  const fallback = engine.getFallback(taskType, key);
  return {
    ...fallback,
    meta: {
      ...fallback.meta,
      finishReason: 'timeout',
    },
  };
}

function toLowDataFallback(
  engine: FallbackEngine,
  taskType: AgentTaskType,
  key: FallbackLookupKey,
): AgentResponseEnvelope {
  const fallback = engine.getFallback(taskType, key);
  return {
    ...fallback,
    meta: {
      ...fallback.meta,
      finishReason: 'fallback',
    },
  };
}

function toEnvelopeStatusColor(
  value: RuleEvaluationResult['statusColor'],
): AgentResponseEnvelope['statusColor'] {
  if (value === 'red') return 'error';
  if (value === 'yellow') return 'warning';
  return 'good';
}
