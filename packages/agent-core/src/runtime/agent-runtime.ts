import type { AgentRequest } from '../types/agent-request';
import type { AgentResponseEnvelope, AgentTaskType, DataTab, Locale } from '@health-advisor/shared';
import { AgentTaskType, DEFAULT_LOCALE } from '@health-advisor/shared';
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
import { verifyOutput } from '../output/verifier';
import type { VerifierInput } from '../output/verifier';
import type { VerificationReport } from '../output/verification-report';
import { ReflectionObserver } from '../output/reflection-observer';
import type { ReflectionArtifact } from '../output/reflection-types';
import type { PlanBuilderDeps } from '../planner/advisor-plan-builder';
import { buildAnalysisPlanWithRetry } from '../planner/advisor-plan-builder';
import type { AnalysisPlan } from '../planner/analysis-plan';
import type { PlanVerificationResult } from '../planner/analysis-plan';

export interface AgentRuntimeDeps extends ContextBuilderDeps {
  agent: HealthAgent;
  promptLoader: PromptLoader;
  fallbackEngine: FallbackEngine;
  /** 可选的参考日期，用于固定 eval 数据窗口（格式：YYYY-MM-DD） */
  referenceDate?: string;
  /** P0 新增：异步 reflection observer（可选） */
  reflectionObserver?: ReflectionObserver;
  /** P1 新增：planner 依赖（可选，不设置时 ADVISOR_CHAT 退化为原有单次调用模式） */
  planBuilder?: PlanBuilderDeps;
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
  /** P0 新增：确定性验证完成后触发 */
  onVerified?(report: VerificationReport): void;
  /** P0 新增：异步 reflection 完成后触发 */
  onReflected?(artifact: ReflectionArtifact): void;
  /** P1 新增：plan 生成后触发 */
  onPlanBuilt?(plan: AnalysisPlan): void;
  /** P1 新增：plan 失败时触发 */
  onPlanFailed?(reason: 'parse_error' | 'verification_failed' | 'invocation_error'): void;
  /** P1 新增：clarification 响应触发 */
  onClarification?(question: string): void;
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
  locale: Locale = DEFAULT_LOCALE,
): Promise<AgentResponseEnvelope> {
  const fallbackKey: FallbackLookupKey = {
    profileId: request.profileId,
    pageContext: request.pageContext,
    tab: request.tab ?? ('dataTab' in request.pageContext ? (request.pageContext as { dataTab?: DataTab }).dataTab : undefined),
  };

  try {
    // 1. 构建 Agent 上下文
    const context = buildAgentContext(request, deps, deps.referenceDate, locale);
    tryNotify(() => observer?.onContextBuilt?.(context));

    // 2. low-data 快速 fallback：数据不足时跳过 LLM 调用
    if (context.signals.lowData) {
      tryNotify(() => observer?.onFallback?.('low_data'));
      return toLowDataFallback(deps.fallbackEngine, request.taskType, fallbackKey, locale);
    }

    // 3. 执行规则引擎
    const rulesResult = evaluateRules(context);
    tryNotify(() => observer?.onRulesEvaluated?.(rulesResult));

    // 4. 构建 TaskContextPacket
    const packet = buildTaskContextPacket(context, rulesResult);
    tryNotify(() => observer?.onPacketBuilt?.(packet));

    // P1: ADVISOR_CHAT planner 链路
    let analysisPlan: AnalysisPlan | undefined;
    if (request.taskType === AgentTaskType.ADVISOR_CHAT && deps.planBuilder) {
      const planResult = await buildAnalysisPlanWithRetry(
        deps.planBuilder,
        {
          userMessage: request.userMessage ?? '',
          pageContext: request.pageContext,
          basePacket: packet,
          supportedMetrics: getSupportedMetrics(),
          availableDateRange: {
            start: context.dataWindow.start,
            end: context.dataWindow.end,
          },
        },
      );

      if (!planResult.success) {
        // Plan 失败：确定失败原因并通知 observer
        const reason = planResult.parseError
          ? (planResult.parseError.includes('调用失败') ? 'invocation_error' : 'parse_error')
          : 'verification_failed';
        tryNotify(() => observer?.onPlanFailed?.(reason));

        // 返回安全响应（不绕过 planner 直接回答复杂问题）
        return toClarificationOrSafeResponse(
          deps.fallbackEngine, request, planResult, fallbackKey, locale,
        );
      }

      analysisPlan = planResult.plan!;

      if (analysisPlan.userIntent.needsClarification) {
        tryNotify(() => observer?.onClarification?.(analysisPlan!.userIntent.clarificationQuestion ?? ''));
        return toClarificationResponse(request, analysisPlan);
      }

      tryNotify(() => observer?.onPlanBuilt?.(analysisPlan!));
    }

    // 5. 构建 prompts（传入 packet）
    const systemPrompt = buildSystemPrompt(context, deps.promptLoader, packet.missingData);
    let taskPrompt = buildTaskPrompt(context, deps.promptLoader, rulesResult, packet);

    // P1: 如有 plan，将 plan 上下文追加到 task prompt
    if (analysisPlan) {
      taskPrompt = appendPlanContextToPrompt(taskPrompt, analysisPlan, packet);
    }

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
      return toFallback(deps.fallbackEngine, request.taskType, fallbackKey, locale);
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

    // P0: 确定性验证（同步，不阻断输出，但产生观测 artifact）
    const verifierInput: VerifierInput = {
      envelope: result,
      context,
      rulesResult,
      packet,
      parseResult: { success: true },
    };
    let verificationReport: VerificationReport;
    try {
      verificationReport = verifyOutput(verifierInput);
    } catch {
      // verifier 异常不得影响主链路，使用安全默认报告
      verificationReport = {
        envelope: result,
        context: { taskType: context.task.type, missingData: [], visibleCharts: [], ruleInsights: [] },
        violations: [],
        summary: { total: 0, passed: 0, failed: 0, hardFailures: 0 },
        verifiedAt: new Date().toISOString(),
      };
    }
    tryNotify(() => observer?.onVerified?.(verificationReport));

    // P0: 异步 reflection（不阻断，后台执行）
    if (deps.reflectionObserver) {
      deps.reflectionObserver.observeAsync({
        envelope: result,
        report: verificationReport,
        context: {
          task: { type: context.task.type, userMessage: context.task.userMessage },
          dataWindow: { missingFields: context.dataWindow.missingFields },
          signals: { overallStatus: context.signals.overallStatus, anomalies: context.signals.anomalies },
        },
        packet: {
          evidence: packet.evidence,
          missingData: packet.missingData,
          visibleCharts: packet.visibleCharts,
        },
        systemPrompt,
        taskPrompt,
      }).then((artifact) => {
        tryNotify(() => observer?.onReflected?.(artifact));
      }).catch(() => {
        // reflection 失败不得影响生产
      });
    }

    tryNotify(() => observer?.onParsed?.(result));

    return result;
  } catch (error) {
    if (error instanceof TimeoutError) {
      tryNotify(() => observer?.onFallback?.('timeout'));
      return toTimeoutFallback(deps.fallbackEngine, request.taskType, fallbackKey, locale);
    }
    tryNotify(() => observer?.onFallback?.('provider_error'));
    return toFallback(deps.fallbackEngine, request.taskType, fallbackKey, locale);
  }
}

function evaluateRules(context: AgentContext): RuleEvaluationResult {
  switch (context.task.type) {
    case AgentTaskType.HOMEPAGE_SUMMARY:
      return evaluateHomepageRules(context);
    case AgentTaskType.VIEW_SUMMARY:
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
    case AgentTaskType.HOMEPAGE_SUMMARY:
      deps.analyticalMemory.setHomepageBrief(sessionId, profileId, summary);
      break;
    case AgentTaskType.VIEW_SUMMARY: {
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
  locale: Locale,
): AgentResponseEnvelope {
  return engine.getFallback(taskType, key, locale);
}

function toTimeoutFallback(
  engine: FallbackEngine,
  taskType: AgentTaskType,
  key: FallbackLookupKey,
  locale: Locale,
): AgentResponseEnvelope {
  const fallback = engine.getFallback(taskType, key, locale);
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
  locale: Locale,
): AgentResponseEnvelope {
  const fallback = engine.getFallback(taskType, key, locale);
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

/** 获取支持的指标列表 */
function getSupportedMetrics(): string[] {
  return ['hrv', 'sleep', 'activity', 'stress', 'spo2', 'resting-hr'];
}

/** 将 AnalysisPlan 上下文追加到 task prompt */
function appendPlanContextToPrompt(
  taskPrompt: string,
  plan: AnalysisPlan,
  _packet: TaskContextPacket,
): string {
  const sections: string[] = [taskPrompt];

  sections.push('');
  sections.push('## 分析计划');

  // 证据需求
  if (plan.evidenceNeeds.length > 0) {
    sections.push('### 需要引用的证据');
    for (const need of plan.evidenceNeeds) {
      const status = need.required ? '[必需]' : '[可选]';
      sections.push(`- ${status} ${need.metric} (${need.timeScope}): ${need.reason}`);
    }
  }

  // 安全约束
  if (plan.safetyConstraints.length > 0) {
    sections.push('### 安全约束');
    for (const constraint of plan.safetyConstraints) {
      sections.push(`- ${constraint}`);
    }
  }

  // 回答格式
  sections.push('### 回答格式要求');
  sections.push(`- 语气: ${plan.answerShape.tone === 'concise' ? '简洁' : '详细解释'}`);
  sections.push(`- 最大长度: ${plan.answerShape.maxSummaryLength} 字`);
  if (plan.answerShape.includeMissingDataDisclosure) {
    sections.push('- 必须披露数据不足的情况');
  }
  if (plan.answerShape.includeChartTokens) {
    sections.push('- 包含相关图表引用');
  }

  return sections.join('\n');
}

/** 构造 clarification 响应（用户意图不明确时） */
function toClarificationResponse(
  request: AgentRequest,
  plan: AnalysisPlan,
): AgentResponseEnvelope {
  const question = plan.userIntent.clarificationQuestion ?? '能否更具体地描述您的问题？';
  return {
    summary: `为了更好地帮助您，我需要更多信息：${question}`,
    source: 'planner',
    statusColor: 'good',
    chartTokens: [],
    microTips: [],
    meta: {
      taskType: request.taskType,
      pageContext: request.pageContext,
      finishReason: 'complete',
      sessionId: request.sessionId,
    },
  };
}

/** Plan 失败时返回安全响应 */
function toClarificationOrSafeResponse(
  engine: FallbackEngine,
  request: AgentRequest,
  planResult: { success: false; parseError?: string; verificationResult?: PlanVerificationResult },
  key: FallbackLookupKey,
  locale: Locale,
): AgentResponseEnvelope {
  // 如果有 verification result 但 plan 不合法，返回 fallback
  const fallback = engine.getFallback(request.taskType, key, locale);
  return {
    ...fallback,
    summary: '抱歉，我暂时无法理解您的问题，请尝试更具体地描述您的健康数据问题。',
    meta: {
      ...fallback.meta,
      finishReason: 'fallback',
    },
  };
}
