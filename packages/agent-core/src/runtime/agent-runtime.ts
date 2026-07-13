import type { AgentRequest } from '../types/agent-request';
import type { AgentResponseEnvelope, DataTab, Locale } from '@health-advisor/shared';
import { AgentTaskType, DEFAULT_LOCALE } from '@health-advisor/shared';
import type { ContextBuilderDeps } from '../context/context-types';
import type { HealthAgent } from '../executor/create-agent';
import type { PromptLoader } from '../prompts/prompt-loader';
import type { FallbackEngine, FallbackLookupKey } from '../fallback/fallback-engine';
import type { AgentContext } from '../types/agent-context';
import type { RecentRecommendedAction } from '../types/memory';
import type { UserMemoryFact } from '../types/durable-memory';
import { buildAgentContext } from '../context/context-builder';
import { evaluateHomepageRules } from '../rules/homepage-rules';
import { evaluateViewSummaryRules } from '../rules/view-summary-rules';
import type { RuleEvaluationResult } from '../rules/types';
import { buildSystemPrompt } from '../prompts/system-builder';
import { buildTaskPrompt } from '../prompts/task-builder';
import { parseAgentResponse } from '../output/response-parser';
import { validateChartTokens } from '../output/token-validator';
import { cleanSafetyIssues } from '../output/safety-cleaner';
import {
  enforceCustomerContentPolicy,
  buildRegenerationFeedback,
} from '../output/realtime-brief-content-policy';
import { buildCustomerFacingEvidencePacket } from '../context/customer-facing-evidence';
import { withTimeout, TimeoutError } from './timeout-controller';
import { AGENT_SLA_TIMEOUT_MS } from '../constants/limits';

/** H-10: ReAct 最大步骤数（设计文档要求固定为 3） */
const MAX_REACT_STEPS = 3;

/** H-10: 缺失数据高风险阈值（缺失字段数 >= 此值视为高风险） */
const MISSING_DATA_HIGH_RISK_THRESHOLD = 2;
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
import type { SyncReflectionReviewer } from '../output/reflection-reviewer';
import { runSyncReflectionGate } from '../output/sync-reflection-gate';
import type { SyncGateResult } from '../output/sync-reflection-gate';
import type { ReflectionReviewResult } from '../output/reflection-schema';
import { resolveEvidenceByPlan } from '../planner/evidence-resolver';
import type { EvidenceResolutionResult } from '../planner/evidence-resolver';
import { runConstrainedReAct } from '../executor/react-loop';
import type { ReActLoopDeps, ReActLoopResult } from '../executor/react-loop';
import type { ReActStep, ToolDefinition } from '../tools/tool-types';
import type { WebSearchInput, WebSearchOutput } from '../tools/web-search';
import {
  appendRealtimeBriefToolEvidenceToPrompt,
  buildRealtimeBriefToolInvocationPlan,
  executeRealtimeBriefToolPlan,
} from './realtime-brief-tool-orchestrator';
import {
  appendWebSearchEvidenceToPrompt,
  collectWebSearchEvidence,
  hasRequiredUnavailableWebSearch,
} from './web-search-evidence';
import type { WebSearchEvidence } from './web-search-evidence';

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
  /** P3 新增：同步审核 reviewer（可选，不设置时高风险请求走 P0 异步观测不阻断） */
  syncReviewer?: SyncReflectionReviewer;
  /** P2 新增：ReAct 循环依赖（可选，不设置时 unresolved evidence 不会触发额外取证） */
  reactLoop?: ReActLoopDeps;
  /** 持久化记忆存储（可选） */
  durableMemory?: {
    listActiveFacts(input: { userScopeId: string; profileId: string }): Promise<UserMemoryFact[]>;
  };
  /** 用户范围标识（用于 durable memory 查询） */
  userScopeId?: string;
  /** WebSearch 工具（可选，不设置时不执行外部搜索） */
  webSearchTool?: ToolDefinition<WebSearchInput, WebSearchOutput>;
  /** WebSearch 配置 */
  webSearchConfig?: {
    enabled: boolean;
    maxResults: number;
  };
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
  /** H-7: plan 验证完成后触发 */
  onPlanVerified?(plan: AnalysisPlan, ctx: { supportedMetrics: string[] }): void;
  /** P1 新增：plan 失败时触发 */
  onPlanFailed?(
    reason: 'parse_error' | 'verification_failed' | 'invocation_error' | 'schema_error',
  ): void;
  /** P1 新增：clarification 响应触发 */
  onClarification?(question: string): void;
  /** P3 新增：sync gate 审核完成后触发 */
  onSyncGate?(result: SyncGateResult): void;
  /** P3 新增：安全边界响应触发 */
  onSafetyBoundary?(violations: ReflectionReviewResult['violations']): void;
  /** P2 新增：证据解析完成后触发 */
  onEvidenceResolved?(result: EvidenceResolutionResult): void;
  /** P2 新增：ReAct 步骤完成后触发 */
  onReActStep?(step: ReActStep): void;
  /** WebSearch evidence 收集完成后触发 */
  onWebSearchEvidence?(evidence: WebSearchEvidence[]): void;
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
    tab:
      request.tab ??
      ('dataTab' in request.pageContext
        ? (request.pageContext as { dataTab?: DataTab }).dataTab
        : undefined),
  };

  try {
    // 1. 加载持久化记忆
    const durableFacts = deps.durableMemory
      ? await deps.durableMemory.listActiveFacts({
          userScopeId: deps.userScopeId ?? 'demo',
          profileId: request.profileId,
        })
      : [];

    // 2. 构建 Agent 上下文
    const context = buildAgentContext(request, deps, deps.referenceDate, locale, durableFacts);
    tryNotify(() => observer?.onContextBuilt?.(context));

    // 3. low-data 快速 fallback：数据不足时跳过 LLM 调用
    if (context.signals.lowData) {
      tryNotify(() => observer?.onFallback?.('low_data'));
      return toLowDataFallback(deps.fallbackEngine, request.taskType, fallbackKey, locale);
    }

    // 4. 执行规则引擎
    const rulesResult = evaluateRules(context);
    tryNotify(() => observer?.onRulesEvaluated?.(rulesResult));

    // 5. 构建 TaskContextPacket
    const packet = buildTaskContextPacket(context, rulesResult);
    tryNotify(() => observer?.onPacketBuilt?.(packet));

    // P1: ADVISOR_CHAT planner 链路
    let analysisPlan: AnalysisPlan | undefined;
    if (request.taskType === AgentTaskType.ADVISOR_CHAT && deps.planBuilder) {
      const planResult = await buildAnalysisPlanWithRetry(deps.planBuilder, {
        userMessage: request.userMessage ?? '',
        pageContext: request.pageContext,
        basePacket: packet,
        supportedMetrics: getSupportedMetrics(),
        availableDateRange: {
          start: context.dataWindow.start,
          end: context.dataWindow.end,
        },
      });

      if (!planResult.success) {
        // Plan 失败：确定失败原因并通知 observer
        // H-14: 优先使用结构化 failureType，向后兼容
        const reason =
          planResult.failureType ?? (planResult.parseError ? 'parse_error' : 'verification_failed');
        tryNotify(() => observer?.onPlanFailed?.(reason));

        // 返回安全响应（不绕过 planner 直接回答复杂问题）
        return toClarificationOrSafeResponse(
          deps.fallbackEngine,
          request,
          planResult as {
            success: false;
            parseError?: string;
            verificationResult?: PlanVerificationResult;
            failureType?: string;
          },
          fallbackKey,
          locale,
        );
      }

      analysisPlan = planResult.plan!;

      if (analysisPlan.userIntent.needsClarification) {
        tryNotify(() =>
          observer?.onClarification?.(analysisPlan!.userIntent.clarificationQuestion ?? ''),
        );
        return toClarificationResponse(request, analysisPlan);
      }

      tryNotify(() => observer?.onPlanBuilt?.(analysisPlan!));
      // H-7: plan 验证通过后通知 observer
      tryNotify(() =>
        observer?.onPlanVerified?.(analysisPlan!, { supportedMetrics: getSupportedMetrics() }),
      );
    }

    // P2: Evidence Resolver + ReAct Loop（仅在 plan 成功后执行）
    let resolvedEvidence: EvidenceResolutionResult['resolved'] | undefined;
    if (analysisPlan && analysisPlan.evidenceNeeds.length > 0) {
      // C-3: 包裹 try-catch，P2 失败不应阻断主链路
      let resolutionResult: EvidenceResolutionResult;
      try {
        resolutionResult = resolveEvidenceByPlan(analysisPlan, packet);
        tryNotify(() => observer?.onEvidenceResolved?.(resolutionResult));
        resolvedEvidence = resolutionResult.resolved;
      } catch {
        // evidence 解析异常：resolvedEvidence 保持 undefined，solver 仅基于 prompt 工作
        resolutionResult = { resolved: [], unresolved: [] };
      }

      // 有未满足的 required evidence 且配置了 reactLoop → 运行受限 ReAct
      if (resolutionResult.unresolved.length > 0 && deps.reactLoop) {
        // C-3: 创建 AbortController 将整体超时传递给 ReAct 循环
        const reactController = new AbortController();
        const reactTimeout = setTimeout(() => reactController.abort(), timeoutMs);
        // C-5: 记录是否被中断
        let reactAborted = false;
        try {
          const reactResult = await runConstrainedReAct(deps.reactLoop, {
            unresolvedNeeds: resolutionResult.unresolved,
            context: { packet, context },
            maxSteps: MAX_REACT_STEPS,
            signal: reactController.signal,
          });

          // 通知 observer 每一步
          for (const step of reactResult.steps) {
            tryNotify(() => observer?.onReActStep?.(step));
          }

          // C-5: 被中断时不追加不完整 evidence，避免错误关联
          if (!reactAborted) {
            // H-2: 使用 metric 精确匹配 evidence 和 need
            resolvedEvidence = [
              ...(resolvedEvidence ?? []),
              ...reactResult.collectedEvidence.map((e) => {
                const matchedNeed = e.metric
                  ? resolutionResult.unresolved.find((n) => n.metric === e.metric)
                  : undefined;
                return {
                  need: matchedNeed ?? resolutionResult.unresolved[0]!,
                  evidence: e,
                };
              }),
            ];
          }
        } catch (error) {
          // ReAct 异常：检查是否是 abort 导致的
          if (reactController.signal.aborted) {
            reactAborted = true;
            // 超时中断，不追加不完整 evidence
          }
          // 其他异常静默处理，不影响主链路
        } finally {
          clearTimeout(reactTimeout);
        }
      }
    }

    // WebSearch: 当 plan 包含 webSearchNeeds 时执行外部搜索
    let webSearchEvidence: WebSearchEvidence[] = [];
    if (analysisPlan && analysisPlan.webSearchNeeds && analysisPlan.webSearchNeeds.length > 0) {
      webSearchEvidence = await collectWebSearchEvidence(
        analysisPlan,
        {
          webSearchTool: deps.webSearchTool,
          maxResults: deps.webSearchConfig?.maxResults ?? 3,
        },
        { packet, context },
      );
      tryNotify(() => observer?.onWebSearchEvidence?.(webSearchEvidence));

      if (hasRequiredUnavailableWebSearch(webSearchEvidence)) {
        return toRequiredWebSearchUnavailableResponse(request);
      }
    }

    // 6. 构建 prompts（传入 packet）
    const systemPrompt = buildSystemPrompt(context, deps.promptLoader, packet.missingData);
    let taskPrompt = buildTaskPrompt(context, deps.promptLoader, rulesResult, packet);

    if (request.taskType === AgentTaskType.HOMEPAGE_SUMMARY) {
      const realtimeToolPlan = buildRealtimeBriefToolInvocationPlan(packet, context);
      const realtimeToolEvidence = await executeRealtimeBriefToolPlan(
        realtimeToolPlan,
        packet,
        context,
      );
      taskPrompt = appendRealtimeBriefToolEvidenceToPrompt(taskPrompt, realtimeToolEvidence);
    }

    // P1: 如有 plan，将 plan 上下文追加到 task prompt
    if (analysisPlan) {
      taskPrompt = appendPlanContextToPrompt(taskPrompt, analysisPlan, packet, resolvedEvidence);
    }

    // WebSearch evidence 注入 prompt
    if (webSearchEvidence.length > 0) {
      taskPrompt = appendWebSearchEvidenceToPrompt(taskPrompt, webSearchEvidence);
    }

    tryNotify(() => observer?.onPromptBuilt?.({ systemPrompt, taskPrompt }));

    // 7. 带超时调用 LLM，超时时通过 AbortSignal 真正中断底层调用
    const raw = await withTimeout(
      (signal) => deps.agent.invoke({ systemPrompt, userPrompt: taskPrompt, signal }),
      timeoutMs,
    );
    tryNotify(() => observer?.onModelOutput?.(raw.content));

    // 8. 解析结构化输出
    const parseResult = parseAgentResponse(raw.content, {
      taskType: request.taskType,
      pageContext: request.pageContext,
      defaultStatusColor: toEnvelopeStatusColor(rulesResult.statusColor),
      demoNow: context.demoNow,
    });

    if (!parseResult.success) {
      tryNotify(() => observer?.onFallback?.('invalid_output'));
      return toFallback(deps.fallbackEngine, request.taskType, fallbackKey, locale);
    }

    // 9. 校验 chart tokens（只能来自 visibleCharts 或 suggestedChartTokens）
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

    // 10. Safety clean
    const cleaned = cleanSafetyIssues(
      safeEnvelope.summary,
      context.dataWindow.missingFields,
      safeEnvelope.microTips ?? [],
      safeEnvelope.actions ?? [],
    );

    const cleanedEnvelope: AgentResponseEnvelope = {
      ...safeEnvelope,
      summary: cleaned.cleaned,
      microTips: cleaned.cleanedTips.length > 0 ? cleaned.cleanedTips : undefined,
      actions: cleaned.cleanedActions.length > 0 ? cleaned.cleanedActions : undefined,
      meta: {
        ...safeEnvelope.meta,
        finishReason: 'complete',
      },
    };

    // ── Task 3.3: Customer Content Policy（阻断式） ──
    // 在 memory 写入 / verifier / cache 之前执行。
    // 违规时允许一次 regeneration；仍失败则 fail-closed typed error。
    const actionCandidates = collectActionCandidates(packet);
    const customerEvidencePacket = buildCustomerFacingEvidencePacket(packet, locale);

    const firstPolicyResult = enforceCustomerContentPolicy({
      envelope: cleanedEnvelope,
      evidencePacket: customerEvidencePacket,
      actionCandidates,
      locale,
      taskType: context.task.type,
    });

    // 最终用于后续流程的 envelope（policy 通过的版本）
    let result: AgentResponseEnvelope;

    if (firstPolicyResult.approved) {
      result = cleanedEnvelope;
    } else {
      // 违规 → 尝试一次 regeneration（仅传结构化 violation code + 客户规则，不含内部值）
      const feedback = buildRegenerationFeedback(firstPolicyResult.violations, locale);
      const regeneratedTaskPrompt = `${taskPrompt}\n\n${feedback}`;
      const regeneratedRaw = await deps.agent.invoke({
        systemPrompt,
        userPrompt: regeneratedTaskPrompt,
      });
      tryNotify(() => observer?.onModelOutput?.(regeneratedRaw.content));

      const regeneratedParsed = parseAgentResponse(regeneratedRaw.content, {
        taskType: request.taskType,
        pageContext: request.pageContext,
        defaultStatusColor: toEnvelopeStatusColor(rulesResult.statusColor),
        demoNow: context.demoNow,
      });

      if (!regeneratedParsed.success) {
        // 重生成解析失败 → fail-closed
        tryNotify(() => observer?.onFallback?.('invalid_output'));
        return toCustomerPolicyError(request, locale);
      }

      const regeneratedTokens = validateChartTokens(
        regeneratedParsed.envelope.chartTokens,
        Array.from(allowedTokens),
      );
      const regeneratedCleaned = cleanSafetyIssues(
        regeneratedParsed.envelope.summary,
        context.dataWindow.missingFields,
        regeneratedParsed.envelope.microTips ?? [],
        regeneratedParsed.envelope.actions ?? [],
      );
      const regeneratedEnvelope: AgentResponseEnvelope = {
        ...regeneratedParsed.envelope,
        chartTokens: regeneratedTokens.valid,
        summary: regeneratedCleaned.cleaned,
        microTips: regeneratedCleaned.cleanedTips.length > 0 ? regeneratedCleaned.cleanedTips : undefined,
        actions: regeneratedCleaned.cleanedActions.length > 0 ? regeneratedCleaned.cleanedActions : undefined,
        meta: { ...regeneratedParsed.envelope.meta, finishReason: 'complete' },
      };

      const secondPolicyResult = enforceCustomerContentPolicy({
        envelope: regeneratedEnvelope,
        evidencePacket: customerEvidencePacket,
        actionCandidates,
        locale,
        taskType: context.task.type,
      });

      if (!secondPolicyResult.approved) {
        // 第二次仍违规 → fail-closed typed error，不写 memory
        return toCustomerPolicyError(request, locale);
      }

      result = regeneratedEnvelope;
    }

    // onParsed: 结构化输出已解析完成（时序: onParsed → onVerified → onSyncGate → onReflected）
    tryNotify(() => observer?.onParsed?.(result));

    // 11. 写回 session memory
    writeSessionMemory(deps, request, result.summary);

    // 12. 写回 analytical memory
    writeAnalyticalMemory(deps, request, context, result.summary, rulesResult, packet);

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
        context: {
          taskType: context.task.type,
          missingData: [],
          visibleCharts: [],
          ruleInsights: [],
        },
        violations: [],
        summary: { total: 0, passed: 0, failed: 0, hardFailures: 0 },
        verifiedAt: new Date().toISOString(),
      };
    }
    tryNotify(() => observer?.onVerified?.(verificationReport));

    // P3: 同步审核闸门（仅高风险场景 + syncReviewer 已配置时触发）
    if (
      deps.syncReviewer &&
      shouldTriggerSyncGate(analysisPlan, verificationReport, context, request.userMessage)
    ) {
      // H-9: 整个 Sync Gate 流程共享 AbortController，控制总超时预算
      const gateController = new AbortController();
      const gateTimeout = setTimeout(() => gateController.abort(), timeoutMs);

      try {
        const gateResult = await runSyncReflectionGate(
          {
            reviewer: deps.syncReviewer,
            verifierInput,
            plan: analysisPlan,
            collectedEvidence: undefined, // P2 evidence 通过 packet 已注入 prompt
            precomputedVerificationReport: verificationReport, // H-6: 复用已计算的 verifier 结果
            signal: gateController.signal, // H-9: 传递共享 signal
          },
          result,
        );
        tryNotify(() => observer?.onSyncGate?.(gateResult));

        if (!gateResult.approved) {
          // H-1: 将 rejection 反馈追加到 taskPrompt，让 solver 知道需要修正什么
          const rejectionFeedback = gateResult.reviewResult?.violations
            ?.map((v) => `- [${v.severity}] ${v.description} → ${v.requiredChanges}`)
            ?.join('\n');
          const regeneratedTaskPrompt = rejectionFeedback
            ? `${taskPrompt}\n\n## 上次回复被审核拒绝，请修正以下问题：\n${rejectionFeedback}`
            : taskPrompt;

          // 重生成一次：基于原始 prompt + rejection 反馈重新调用 solver
          const regeneratedRaw = await deps.agent.invoke({
            systemPrompt,
            userPrompt: regeneratedTaskPrompt,
            signal: gateController.signal, // H-9: 使用共享 signal 控制剩余时间
          });
          const regeneratedParsed = parseAgentResponse(regeneratedRaw.content, {
            taskType: request.taskType,
            pageContext: request.pageContext,
            defaultStatusColor: toEnvelopeStatusColor(rulesResult.statusColor),
            demoNow: context.demoNow,
          });

          // H-1: 跟踪重生成审核结果，用于安全边界 violations
          let reGateResult: SyncGateResult | undefined;

          if (regeneratedParsed.success) {
            const regeneratedTokens = validateChartTokens(
              regeneratedParsed.envelope.chartTokens,
              Array.from(allowedTokens),
            );
            const regeneratedCleaned = cleanSafetyIssues(
              regeneratedParsed.envelope.summary,
              context.dataWindow.missingFields,
              regeneratedParsed.envelope.microTips,
            );
            const regenerated: AgentResponseEnvelope = {
              ...regeneratedParsed.envelope,
              chartTokens: regeneratedTokens.valid,
              summary: regeneratedCleaned.cleaned,
              microTips: regeneratedCleaned.cleanedTips,
              meta: { ...regeneratedParsed.envelope.meta, finishReason: 'complete' },
            };

            // 重生成后再审核一次
            const reVerifierInput: VerifierInput = {
              envelope: regenerated,
              context,
              rulesResult,
              packet,
              parseResult: { success: true },
            };
            reGateResult = await runSyncReflectionGate(
              {
                reviewer: deps.syncReviewer,
                verifierInput: reVerifierInput,
                plan: analysisPlan,
                signal: gateController.signal, // H-9: 传递共享 signal
              },
              regenerated,
            );

            if (reGateResult!.approved) {
              // Task 3.3 (I-1): Sync gate 重生成通过后，仍需通过客户内容策略。
              // sync gate 关注安全/医疗边界，customer policy 关注客户可见措辞边界，
              // 二者正交。重生成的 envelope 可能引入 internal_score_disclosed 等违规，
              // 必须在 memory 写入前 fail-closed。
              const regeneratedPolicyResult = enforceCustomerContentPolicy({
                envelope: regenerated,
                evidencePacket: customerEvidencePacket,
                actionCandidates,
                locale,
                taskType: context.task.type,
              });
              if (!regeneratedPolicyResult.approved) {
                // 重生成虽通过 sync gate，但违反客户内容策略 → fail-closed typed error
                // 不通知 onSyncGate approved（避免误导观察者），不写 memory
                return toCustomerPolicyError(request, locale);
              }

              // 重生成通过 sync gate + customer policy
              tryNotify(() => observer?.onSyncGate?.(reGateResult!));
              tryNotify(() => observer?.onParsed?.(regenerated));
              // C-3: 对重生成的结果补充 verifier observer
              try {
                const reVerificationReport = verifyOutput(reVerifierInput);
                tryNotify(() => observer?.onVerified?.(reVerificationReport));
              } catch {
                // verifier 异常不得影响重生成返回
              }
              // 注意：重生成的结果也需要写回 memory
              writeSessionMemory(deps, request, regenerated.summary);
              writeAnalyticalMemory(deps, request, context, regenerated.summary, rulesResult);
              return regenerated;
            }
          }

          // 重生成仍不通过或解析失败：返回安全边界说明
          // H-1: 优先使用重生成审核的 violations 而非第一次审核结果
          const effectiveViolations =
            reGateResult?.reviewResult?.violations ?? gateResult.reviewResult?.violations ?? [];
          tryNotify(() => observer?.onSafetyBoundary?.(effectiveViolations));
          return toSafetyBoundaryResponse(request, effectiveViolations);
        }
      } finally {
        clearTimeout(gateTimeout);
      }
    }

    // P0: 异步 reflection（不阻断，后台执行）
    if (deps.reflectionObserver) {
      deps.reflectionObserver
        .observeAsync({
          envelope: result,
          report: verificationReport,
          context: {
            task: { type: context.task.type, userMessage: context.task.userMessage },
            dataWindow: { missingFields: context.dataWindow.missingFields },
            signals: {
              overallStatus: context.signals.overallStatus,
              anomalies: context.signals.anomalies,
            },
          },
          packet: {
            evidence: packet.evidence,
            missingData: packet.missingData,
            visibleCharts: packet.visibleCharts,
          },
          systemPrompt,
          taskPrompt,
        })
        .then((artifact) => {
          tryNotify(() => observer?.onReflected?.(artifact));
        })
        .catch((err) => {
          // reflection 失败不得影响生产，但至少记录 warning
          if (typeof console !== 'undefined' && console.warn) {
            console.warn(
              '[agent-runtime] async reflection failed:',
              err instanceof Error ? err.message : String(err),
            );
          }
        });
    }

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
  packet?: TaskContextPacket,
): void {
  const { sessionId, profileId, taskType } = request;

  switch (taskType) {
    case AgentTaskType.HOMEPAGE_SUMMARY:
      deps.analyticalMemory.setHomepageBrief(sessionId, profileId, summary);
      // 写回行动历史
      if (packet?.homepage) {
        const currentInsight = packet.homepage.eventInsights.find(
          (i) => i.mentionPolicy?.summary === 'allowed',
        );
        if (currentInsight && currentInsight.recommendedFocus.length > 0) {
          const newActions: RecentRecommendedAction[] = currentInsight.recommendedFocus.map(
            (focus, idx) => {
              const intent = currentInsight.actionIntents[idx];
              return {
                category: focus.category,
                microEventType:
                  intent?.interaction?.kind === 'micro_event'
                    ? intent.interaction.microEvent.type
                    : undefined,
                title: intent?.title ?? focus.action,
                timestamp: Date.now(),
              };
            },
          );
          deps.analyticalMemory.setHomepageActions(sessionId, profileId, newActions);
        }
      }
      break;
    case AgentTaskType.VIEW_SUMMARY: {
      const scope =
        context.task.tab && context.task.timeframe
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

/** 将 AnalysisPlan 上下文 + 已解析证据追加到 task prompt */
function appendPlanContextToPrompt(
  taskPrompt: string,
  plan: AnalysisPlan,
  _packet: TaskContextPacket,
  resolvedEvidence?: EvidenceResolutionResult['resolved'],
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

  // P2: 已解析的证据数据
  if (resolvedEvidence && resolvedEvidence.length > 0) {
    sections.push('### 已获取的证据数据');
    for (const { need, evidence } of resolvedEvidence) {
      sections.push(`- ${need.metric}: ${JSON.stringify(evidence.data)}`);
      if (evidence.evidenceIds.length > 0) {
        sections.push(`  证据ID: ${evidence.evidenceIds.join(', ')}`);
      }
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

/** required=true 的 WebSearch 搜索不可用时的安全响应 */
function toRequiredWebSearchUnavailableResponse(request: AgentRequest): AgentResponseEnvelope {
  return {
    summary:
      '当前无法获取外部资料，因此我不能可靠回答这个需要最新外部信息的问题。你可以稍后重试，或改问基于本地健康数据的问题。',
    source: 'planner',
    statusColor: 'warning',
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

/** 构造 clarification 响应（用户意图不明确时） */
function toClarificationResponse(request: AgentRequest, plan: AnalysisPlan): AgentResponseEnvelope {
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
  planResult: {
    success: false;
    parseError?: string;
    verificationResult?: PlanVerificationResult;
    failureType?: string;
  },
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

/** 高风险话题模式：运动准备度、诊断、用药、治疗承诺 */
const HIGH_RISK_TOPIC_PATTERNS = [
  /能.?运动|能.?跑|能.?锻炼|可以运动|可以跑|适合运动|能否锻炼/,
  /诊断|确诊|患有|生了.*病/,
  /服药|用药|吃药|药物|药方/,
  /治疗|治愈|保证恢复|一定会好/,
];

/** 判断是否应触发同步审核闸门 */
function shouldTriggerSyncGate(
  plan: AnalysisPlan | undefined,
  report: VerificationReport,
  context: AgentContext,
  userMessage: string | undefined,
): boolean {
  // 条件 1: plan.riskLevel 为潜在风险或安全边界
  if (
    plan?.userIntent.riskLevel === 'safety_boundary' ||
    plan?.userIntent.riskLevel === 'potential_risk'
  )
    return true;
  // 条件 2: 用户询问运动准备度、诊断、用药、治疗承诺
  if (userMessage && HIGH_RISK_TOPIC_PATTERNS.some((p) => p.test(userMessage))) return true;
  // 条件 3: 输出状态为严重异常（overallStatus === 'red'）
  if (context.signals.overallStatus === 'red') return true;
  // 条件 4: verifier 出现 hard violation
  if (report.summary.hardFailures > 0) return true;
  // 条件 5: Planner 或 verifier 判断存在缺失数据高风险误导
  if (plan?.safetyConstraints.includes('disclose_missing_data') && hasMissingDataRisk(context))
    return true;
  return false;
}

/** 检查是否存在缺失数据导致高风险误导的可能 */
function hasMissingDataRisk(context: AgentContext): boolean {
  const missingCount = context.dataWindow.missingFields?.length ?? 0;
  return missingCount >= MISSING_DATA_HIGH_RISK_THRESHOLD;
}

/** 构造安全边界响应（sync gate 两次都不通过时使用） */
function toSafetyBoundaryResponse(
  request: AgentRequest,
  violations: ReflectionReviewResult['violations'],
): AgentResponseEnvelope {
  const violationSummary =
    violations.length > 0 ? violations.map((v) => v.description).join('；') : '回复未通过安全审核';

  return {
    summary: `为了您的安全，建议咨询专业医生获取准确的健康建议。本次回复因安全原因未通过审核：${violationSummary}`,
    source: 'sync-gate',
    statusColor: 'warning',
    chartTokens: [],
    microTips: ['建议咨询专业医生获取更准确的健康评估'],
    meta: {
      taskType: request.taskType,
      pageContext: request.pageContext,
      finishReason: 'fallback',
      sessionId: request.sessionId,
    },
  };
}

/**
 * Task 3.3: 从当前 displayable event 的 actionIntents 收集 action candidates。
 * 这些 candidates 用于构建 claim ledger，为数值归因检查提供允许列表。
 */
function collectActionCandidates(packet: TaskContextPacket): import('@health-advisor/shared').ActionOption[] {
  const homepage = packet.homepage;
  if (!homepage) return [];
  const current = homepage.eventInsights.find((i) => i.mentionPolicy?.summary === 'allowed');
  if (!current) return [];
  return current.actionIntents.map((intent) => ({
    id: intent.id,
    emoji: intent.emoji,
    title: intent.title,
    description: intent.description,
    aiPromise: intent.aiPromise,
    interaction: intent.interaction as any,
  }));
}

/**
 * Task 3.3: Customer Content Policy fail-closed 错误响应。
 *
 * 当两次 regeneration 都无法通过 customer content policy 时返回。
 * 关键约束：
 * - 不返回任何 LLM 生成的内容（无 fallback brief）
 * - source 标记为 'customer-policy'，便于观测/区分
 * - summary 使用固定安全文案，不包含任何模型输出
 */
function toCustomerPolicyError(request: AgentRequest, _locale: Locale): AgentResponseEnvelope {
  return {
    summary:
      _locale === 'en'
        ? 'Unable to generate a response that meets our content policy. Please try again later.'
        : '当前无法生成符合内容策略的回复，请稍后重试。',
    source: 'customer-policy',
    statusColor: 'warning',
    chartTokens: [],
    microTips: [],
    meta: {
      taskType: request.taskType,
      pageContext: request.pageContext,
      finishReason: 'fallback',
      sessionId: request.sessionId,
    },
  };
}
