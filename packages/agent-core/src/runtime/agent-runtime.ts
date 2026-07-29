import type { AgentRequest } from '../types/agent-request';
import type {
  ActionOption,
  AgentResponseEnvelope,
  DataTab,
  FutureSuggestion,
  Locale,
} from '@health-advisor/shared';
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
import { cleanPlanDraftSafety } from '../output/plan-draft-cleaner';
import {
  enforceCustomerContentPolicy,
  buildRegenerationFeedback,
} from '../output/realtime-brief-content-policy';
import { buildCustomerFacingEvidencePacket } from '../context/customer-facing-evidence';
import { withTimeout, TimeoutError } from './timeout-controller';
import { AGENT_SLA_TIMEOUT_MS } from '../constants/limits';
import { StreamingSummaryExtractor, StreamingSummaryParseError } from '../output/streaming-summary-extractor';
import {
  StreamingStructureExtractor,
  type StructureSignal,
} from '../output/streaming-structure-extractor';

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
import {
  attachSleepInterestOffer,
  resolveProactiveInteraction,
} from './proactive-advisor-flow';

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
  onCustomerPolicyEvaluated?(check: {
    phase: 'initial' | 'regeneration' | 'sync-regeneration';
    approved: boolean;
    violationCodes: string[];
  }): void;
  onParsed?(envelope: AgentResponseEnvelope): void;
  onFallback?(
    reason: 'low_data' | 'invalid_output' | 'timeout' | 'provider_error' | 'streaming_parse_error',
  ): void;
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
 * executeAgent 的可选执行参数（第 6 个参数）。
 *
 * 用于首页实时简报流式传输：
 * - `signal`：外部取消信号（如 HTTP 请求断开），与 runtime 超时 signal 合并，
 *   任一触发都会终止底层 LangChain 迭代器。
 * - `onSummaryDelta`：summary 文本增量回调。仅在 `taskType === HOMEPAGE_SUMMARY`
 *   且提供该回调时进入 stream 分支；每个 delta 都会 `await`，用于传递 HTTP
 *   backpressure（消费端慢时阻塞迭代）。
 * - `onSummaryDone`：summary 字段值完整结束时触发一次（去重）。比 `onActionReady`
 *   早——前者在 JSON parser 见到 summary 字符串闭合即触发，后者要等 actions
 *   数组首个元素对象完整闭合。UI 据此在 summary 流式结束后立即展示卡片 Skeleton。
 * - `onActionReady`：actions 数组中单个元素就绪时触发（index 为数组下标）。
 * - `onForecastStarted`：futureSuggestions 区段开始（首个元素就绪）时触发一次，
 *   先于紧随其后的 `onFutureSuggestionReady`；若 LLM 未生成 futureSuggestions 则不触发。
 * - `onFutureSuggestionReady`：futureSuggestions 数组中单个元素就绪时触发。
 *
 * 结构回调仅决定是否在 stream 分支并行运行 `StreamingStructureExtractor`；不改变
 * useStream 触发条件（仍是 `HOMEPAGE_SUMMARY + onSummaryDelta`）。route 层总是
 * 同时提供 summary 与结构回调。
 */
export interface AgentExecutionOptions {
  signal?: AbortSignal;
  onSummaryDelta?: (delta: string) => void | Promise<void>;
  onSummaryDone?: () => void | Promise<void>;
  onActionReady?: (index: number, action: ActionOption) => void | Promise<void>;
  onForecastStarted?: () => void | Promise<void>;
  onFutureSuggestionReady?: (index: number, suggestion: FutureSuggestion) => void | Promise<void>;
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
  options?: AgentExecutionOptions,
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

    // 3. low-data 快速 fallback：数据不足时跳过 LLM 调用。
    // ADVISOR_CHAT + planBuilder 是例外：纯 UI 控制不依赖健康数据，
    // 必须先执行 Planner 才能识别 control_ui 意图，因此跳过 low-data 快速 fallback。
    // 没有 planBuilder 的 ADVISOR_CHAT 保持原有降级路径，避免回退到无 Planner 的盲调用。
    const allowLowDataShortcut =
      request.taskType !== AgentTaskType.ADVISOR_CHAT || !deps.planBuilder;
    if (context.signals.lowData && allowLowDataShortcut) {
      tryNotify(() => observer?.onFallback?.('low_data'));
      return persistChatTurnAndReturn(
        deps,
        request,
        toLowDataFallback(deps.fallbackEngine, request.taskType, fallbackKey, locale),
      );
    }

    // 4. 执行规则引擎
    const rulesResult = evaluateRules(context);
    tryNotify(() => observer?.onRulesEvaluated?.(rulesResult));

    // 5. 构建 TaskContextPacket
    const packet = buildTaskContextPacket(context, rulesResult);
    tryNotify(() => observer?.onPacketBuilt?.(packet));

    let analysisPlan: AnalysisPlan | undefined;

    // Proactive 按钮携带的是 schema 校验后的封闭事件，不需要把按钮文案再次交给
    // Planner 猜意图。UI 操作直接返回受控 directive；创建计划则进入同一 structured_plan
    // solver 契约，保留证据解析、安全清洗与审核链路。
    const proactiveResolution =
      request.taskType === AgentTaskType.ADVISOR_CHAT
        ? resolveProactiveInteraction(request, context, locale)
        : { kind: 'none' as const };
    if (proactiveResolution.kind === 'response') {
      tryNotify(() => observer?.onParsed?.(proactiveResolution.envelope));
      return persistChatTurnAndReturn(deps, request, proactiveResolution.envelope);
    }
    if (proactiveResolution.kind === 'plan') {
      analysisPlan = proactiveResolution.plan;
      tryNotify(() => observer?.onPlanBuilt?.(analysisPlan!));
      tryNotify(() =>
        observer?.onPlanVerified?.(analysisPlan!, { supportedMetrics: getSupportedMetrics() }),
      );
    }

    // P1: ADVISOR_CHAT planner 链路
    if (
      !analysisPlan &&
      request.taskType === AgentTaskType.ADVISOR_CHAT &&
      deps.planBuilder
    ) {
      const planResult = await buildAnalysisPlanWithRetry(deps.planBuilder, {
        userMessage: request.userMessage ?? '',
        locale,
        pageContext: request.pageContext,
        basePacket: packet,
        supportedMetrics: getSupportedMetrics(),
        availableDateRange: {
          start: context.dataWindow.start,
          end: context.dataWindow.end,
        },
        ...(request.uiContext ? { uiContext: request.uiContext } : {}),
      });

      if (!planResult.success) {
        // Plan 失败：确定失败原因并通知 observer
        // H-14: 优先使用结构化 failureType，向后兼容
        const reason =
          planResult.failureType ?? (planResult.parseError ? 'parse_error' : 'verification_failed');
        tryNotify(() => observer?.onPlanFailed?.(reason));

        // 返回安全响应（不绕过 planner 直接回答复杂问题）
        return persistChatTurnAndReturn(
          deps,
          request,
          toPlannerFailureResponse(request),
        );
      }

      analysisPlan = planResult.plan!;

      if (analysisPlan.userIntent.needsClarification) {
        tryNotify(() =>
          observer?.onClarification?.(analysisPlan!.userIntent.clarificationQuestion ?? ''),
        );
        return persistChatTurnAndReturn(
          deps,
          request,
          toClarificationResponse(request, analysisPlan, locale),
        );
      }

      tryNotify(() => observer?.onPlanBuilt?.(analysisPlan!));
      // H-7: plan 验证通过后通知 observer
      tryNotify(() =>
        observer?.onPlanVerified?.(analysisPlan!, { supportedMetrics: getSupportedMetrics() }),
      );

      // 纯 UI 控制：Planner verifier 通过的 clientAction 即最终结果，不调用健康 solver。
      // persistChatTurnAndReturn 会写 user + assistant 两条 session message，
      // 保证后续 "隐藏它" 等指代本轮指令的消息有上下文。
      if (
        analysisPlan.userIntent.action === 'control_ui' &&
        analysisPlan.clientAction
      ) {
        const uiEnvelope = toControlUiEnvelope(request, analysisPlan, locale);
        tryNotify(() => observer?.onParsed?.(uiEnvelope));
        return persistChatTurnAndReturn(deps, request, uiEnvelope);
      }
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

    // 7. 获取模型完整 raw 输出。
    // HOMEPAGE_SUMMARY 且提供 onSummaryDelta 时走 stream 分支（边收集边推送 summary delta），
    // 否则走 invoke 分支（带超时的单次调用）。两个分支都返回完整 raw 供后续 parser 处理。
    const responseMode = analysisPlan
      ? analysisPlan.userIntent.action === 'create_plan'
        ? 'structured_plan'
        : 'standard'
      : undefined;
    let raw = await obtainRawOutput(
      deps,
      systemPrompt,
      taskPrompt,
      timeoutMs,
      options,
      request.taskType,
    );
    tryNotify(() => observer?.onModelOutput?.(raw.content));

    // 8. 解析结构化输出
    let parseResult = parseAgentResponse(raw.content, {
      taskType: request.taskType,
      pageContext: request.pageContext,
      defaultStatusColor: toEnvelopeStatusColor(rulesResult.statusColor),
      demoNow: context.demoNow,
      responseMode,
    });

    // Planner 已确定响应形态后，Solver 的随机采样不得改变产品行为。
    // 形态不匹配时只允许按同一结构化契约重生成一次；仍不匹配则走 fail-closed。
    if (
      !parseResult.success &&
      (parseResult.failureType === 'response_mode' || responseMode === 'structured_plan')
    ) {
      const regeneratedTaskPrompt = `${taskPrompt}\n\n${buildResponseModeRegenerationFeedback(responseMode!, locale)}`;
      raw = await withTimeout(
        (signal) => deps.agent.invoke({
          systemPrompt,
          userPrompt: regeneratedTaskPrompt,
          signal,
        }),
        timeoutMs,
      );
      tryNotify(() => observer?.onModelOutput?.(raw.content));
      parseResult = parseAgentResponse(raw.content, {
        taskType: request.taskType,
        pageContext: request.pageContext,
        defaultStatusColor: toEnvelopeStatusColor(rulesResult.statusColor),
        demoNow: context.demoNow,
        responseMode,
      });
    }

    if (!parseResult.success) {
      tryNotify(() => observer?.onFallback?.('invalid_output'));
      if (responseMode === 'structured_plan') {
        return persistChatTurnAndReturn(
          deps,
          request,
          toStructuredPlanContractError(request, locale),
        );
      }
      return persistChatTurnAndReturn(
        deps,
        request,
        toFallback(deps.fallbackEngine, request.taskType, fallbackKey, locale),
      );
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

    // 计划草稿文本也走同一套安全清洗：诊断/用药/缺失数据幻觉必须同步处理。
    // 任何字段被触碰都记入 flags；审核链路据此决定是否升级拒绝（这里不直接拒绝）。
    const planDraftCleaned =
      safeEnvelope.planDraftPreview !== undefined
        ? cleanPlanDraftSafety(safeEnvelope.planDraftPreview, context.dataWindow.missingFields)
        : undefined;

    const cleanedEnvelope: AgentResponseEnvelope = {
      ...safeEnvelope,
      summary: cleaned.cleaned,
      microTips: cleaned.cleanedTips.length > 0 ? cleaned.cleanedTips : undefined,
      actions: cleaned.cleanedActions.length > 0 ? cleaned.cleanedActions : undefined,
      planDraftPreview: planDraftCleaned?.cleaned,
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
    tryNotify(() => observer?.onCustomerPolicyEvaluated?.({
      phase: 'initial',
      approved: firstPolicyResult.approved,
      violationCodes: firstPolicyResult.violations.map((violation) => violation.code),
    }));

    // 最终用于后续流程的 envelope（policy 通过的版本）
    let result: AgentResponseEnvelope;

    if (firstPolicyResult.approved) {
      result = cleanedEnvelope;
    } else {
      // 违规 → 尝试一次 regeneration（仅传结构化 violation code + 客户规则，不含内部值）
      const feedback = buildRegenerationFeedback(firstPolicyResult.violations, locale);
      const regeneratedTaskPrompt = `${taskPrompt}\n\n${feedback}`;
      // 重生成同样是一次模型调用，必须受 SLA 预算约束；否则上游在此处迟滞时，
      // 首次调用的 timeout 无法保护请求，前端最终只能收到中断错误。
      const regeneratedRaw = await withTimeout(
        (signal) => deps.agent.invoke({
          systemPrompt,
          userPrompt: regeneratedTaskPrompt,
          signal,
        }),
        timeoutMs,
      );
      tryNotify(() => observer?.onModelOutput?.(regeneratedRaw.content));

      const regeneratedParsed = parseAgentResponse(regeneratedRaw.content, {
        taskType: request.taskType,
        pageContext: request.pageContext,
        defaultStatusColor: toEnvelopeStatusColor(rulesResult.statusColor),
        demoNow: context.demoNow,
        responseMode,
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
      tryNotify(() => observer?.onCustomerPolicyEvaluated?.({
        phase: 'regeneration',
        approved: secondPolicyResult.approved,
        violationCodes: secondPolicyResult.violations.map((violation) => violation.code),
      }));

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
            responseMode,
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
              tryNotify(() => observer?.onCustomerPolicyEvaluated?.({
                phase: 'sync-regeneration',
                approved: regeneratedPolicyResult.approved,
                violationCodes: regeneratedPolicyResult.violations.map((violation) => violation.code),
              }));
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
              // 重生成路径同样需要附加 Planner verifier 通过的 UI 指令。
              const regeneratedWithUi = attachSleepInterestOffer(
                attachVerifiedUiDirective(regenerated, analysisPlan),
                request,
                analysisPlan,
                locale,
              );
              // 注意：重生成的结果也需要写回 memory
              writeSessionMemory(deps, request, regeneratedWithUi.summary);
              writeAnalyticalMemory(deps, request, context, regeneratedWithUi.summary, rulesResult);
              return regeneratedWithUi;
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

    // solver 成功路径：附加 Planner verifier 通过的 UI 指令（如有）。
    // 仅当 finishReason === 'complete' 才附加，fallback/timeout 不携带副作用。
    return attachSleepInterestOffer(
      attachVerifiedUiDirective(result, analysisPlan),
      request,
      analysisPlan,
      locale,
    );
  } catch (error) {
    if (error instanceof TimeoutError) {
      tryNotify(() => observer?.onFallback?.('timeout'));
      return toTimeoutFallback(deps.fallbackEngine, request.taskType, fallbackKey, locale);
    }
    // StreamingSummaryParseError 是流式提取器的协议违规（截断、重复 key、类型错误等），
    // 与 provider error 区分开：返回 fallback envelope（finishReason 非 complete），
    // SSE adapter 会据此转为 failed terminal。memory 不写入（因为没到达写 memory 步骤）。
    const fallbackReason = error instanceof StreamingSummaryParseError
      ? 'streaming_parse_error'
      : 'provider_error';
    tryNotify(() => observer?.onFallback?.(fallbackReason));
    return toFallback(deps.fallbackEngine, request.taskType, fallbackKey, locale);
  }
}

/**
 * 获取模型的完整 raw 输出。
 *
 * ## 分支选择
 *
 * - `HOMEPAGE_SUMMARY + onSummaryDelta`：走 stream 分支，用 StreamingSummaryExtractor
 *   从增量 JSON 中实时释放 `$.summary` 文本 delta，每个 delta 都 `await onSummaryDelta`
 *   以传递 backpressure。
 * - 其他情况：走 invoke 分支（原逻辑，`withTimeout` 包装单次 invoke）。
 *
 * 两个分支都返回 `{ content: string }`（完整 raw）给后续 parseAgentResponse。
 *
 * ## 超时机制差异（stream 分支 vs invoke 分支）⚠️
 *
 * 两个分支的超时机制**不等价**，实现者（尤其是任务 2.2 SSE adapter）必须理解差异：
 *
 * **invoke 分支：** `withTimeout` 用 `Promise.race` 实现，超时直接 reject
 * `TimeoutError`。executeAgent 的 catch 块按 `TimeoutError` 处理 → 走 timeout 分支
 * → `toTimeoutFallback`（`finishReason: 'timeout'`）。
 *
 * **stream 分支：** 不用 `withTimeout`，改用 `setTimeout + AbortController +
 * AbortSignal.any`。超时触发 `timeoutController.abort()`，合并 signal 传给
 * `deps.agent.stream`。LangChain 兼容的 provider iterator 在下一个 yield 点检查
 * signal.aborted，抛 `AbortError`（DOMException 或类似）。这个 AbortError **不是**
 * `TimeoutError`，因此 executeAgent catch 块走 provider_error 分支（对非
 * StreamingSummaryParseError 的错误）→ `toFallback`（`finishReason: 'fallback'`）。
 *
 * 注意：stream 超时**不会**走 TimeoutError → timeout 路径。如果 SSE adapter
 * 需要区分"超时导致的 fallback"和"provider 真实错误"，不能只看 finishReason，
 * 需要通过 observer 或 log 额外区分（或后续任务再统一改造）。
 *
 * ## onSummaryDelta 背压对超时的延迟影响 ⚠️
 *
 * stream 分支的 timeout 定时器在 `await onSummaryDelta(delta)` 期间继续计时，
 * 但 timeout 的"生效"（即 abort 信号被传递给 iterator）需要 iterator 重新进入
 * `for await` 循环才能被检查。如果 `onSummaryDelta` callback 慢（SSE 背压、
 * 网络拥塞、消费端处理重），timeout 只能在当前 callback resolve 后、iterator
 * 回到循环顶部时才生效。实际超时时间可能略大于 `timeoutMs`，超出量约等于
 * 最后一个 `onSummaryDelta` 调用的执行时间。
 *
 * 这是有意为之：保留 backpressure 语义，避免在 callback 中途 abort 导致半写状态。
 * 若对超时精度敏感，需要在 SSE adapter 层自己管理 timer（如响应式 flush + heartbeat）。
 *
 * ## 为什么选方案 B（AbortSignal.any）而非 Promise.race
 *
 * 方案 B（当前实现）的优势：
 * - 保留 `AbortSignal.any` 合并外部 request signal（HTTP 断开、上层取消等）的能力；
 * - 单一 signal 通道贯穿 provider iterator，provider 内部可以在任何 await 点检查 abort；
 * - 不需要在 stream 外再包一层 `Promise.race`，避免双 timeout 路径（race reject +
 *   iterator abort）导致的竞态。
 *
 * 方案 A（用 withTimeout 包 stream 迭代）的劣势：
 * - `Promise.race` 只能 reject 外层 Promise，不会自动 abort 底层 iterator，
 *   provider iterator 会继续在后台消费直到自然结束（资源泄漏）；
 * - 外部 request signal（options.signal）需要二次合并逻辑，复杂度上升。
 */
async function obtainRawOutput(
  deps: AgentRuntimeDeps,
  systemPrompt: string,
  taskPrompt: string,
  timeoutMs: number,
  options: AgentExecutionOptions | undefined,
  taskType: AgentTaskType,
): Promise<{ content: string }> {
  // 仅 HOMEPAGE_SUMMARY 且提供了 onSummaryDelta 时才走流式分支
  const useStream =
    taskType === AgentTaskType.HOMEPAGE_SUMMARY && Boolean(options?.onSummaryDelta);

  if (!useStream) {
    // invoke 分支：保持原有行为，带超时
    const raw = await withTimeout(
      (signal) => deps.agent.invoke({ systemPrompt, userPrompt: taskPrompt, signal }),
      timeoutMs,
    );
    return { content: raw.content };
  }

  // stream 分支：StreamingSummaryExtractor 从增量 JSON 释放 summary delta
  // useStream 已保证 onSummaryDelta 存在；这里用防御性 if 守卫再次确认，
  // 避免双重非空断言（!）在类型变更时静默失败。
  if (!options?.onSummaryDelta) {
    throw new Error('unreachable: onSummaryDelta missing in stream branch');
  }
  const onSummaryDelta = options.onSummaryDelta;
  const summaryExtractor = new StreamingSummaryExtractor();
  // 仅当 route 层提供至少一个结构回调时才并行构造 structure 提取器，避免无谓开销。
  // useStream 触发条件仍由 HOMEPAGE_SUMMARY + onSummaryDelta 决定，不受结构回调影响。
  const hasStructureCallback = Boolean(
    options?.onActionReady || options?.onForecastStarted || options?.onFutureSuggestionReady,
  );
  const structureExtractor = hasStructureCallback ? new StreamingStructureExtractor() : null;
  let rawContent = '';

  // summary done 信号去重：仅在第一次检测到 isSummaryDone 时触发 onSummaryDone 回调。
  // 触发时机比 onActionReady 早——JSON parser 见到 summary 字符串闭合即触发，
  // 不必等 actions 数组首个元素完整闭合。UI 据此立即展示卡片 Skeleton。
  let summaryDoneEmitted = false;
  const maybeEmitSummaryDone = async (): Promise<void> => {
    if (!summaryDoneEmitted && summaryExtractor.isSummaryDone()) {
      summaryDoneEmitted = true;
      await options?.onSummaryDone?.();
    }
  };

  // stream 分支自己管理 timeout：合并内部 timeout signal + 外部 request signal
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
  const signals: AbortSignal[] = [timeoutController.signal];
  if (options?.signal) {
    signals.push(options.signal);
  }
  // AbortSignal.any：任一 signal abort 即合并 signal abort。Node 20+ 原生支持。
  const mergedSignal = AbortSignal.any(signals);

  try {
    for await (const chunk of deps.agent.stream({
      systemPrompt,
      userPrompt: taskPrompt,
      signal: mergedSignal,
    })) {
      rawContent += chunk.content;
      // summary 提取器先 push：其错误（StreamingSummaryParseError 等）由 runtime
      // 上层 catch 统一处理，会驱动 fallback。
      const deltas = summaryExtractor.push(chunk.content);
      for (const delta of deltas) {
        // await 每个回调，传递 backpressure（慢消费端会阻塞迭代）
        await onSummaryDelta(delta);
      }
      // summary 字段可能在本次 push 中完整闭合——先于结构信号检查触发，
      // 让 UI 能立即用 Skeleton 占位卡片区域（不必等首个 action 元素就绪）。
      await maybeEmitSummaryDone();
      // structure 提取器后 push：任何错误都吞掉，绝不中断 summary 流式。
      // 结构信号是渐进式 UI 的优化，丢失不应降级整条 SSE。
      if (structureExtractor) {
        let structureSignals: StructureSignal[] = [];
        try {
          structureSignals = structureExtractor.push(chunk.content);
        } catch {
          // 结构提取器任何错误都吞掉（含 MarkdownFenceError）——
          // 不能中断 summary 流式，summary 提取器的错误由现有 runtime 机制单独处理
        }
        for (const signal of structureSignals) {
          await dispatchStructureSignal(signal, options);
        }
      }
    }
    // 通知 summary extractor 输入结束；JSON 不完整/重复 key/类型错误会抛 StreamingSummaryParseError
    summaryExtractor.finish();
    // structure extractor 的 finish 本身吞错，不会抛
    structureExtractor?.finish();
  } finally {
    clearTimeout(timer);
  }

  return { content: rawContent };
}

/**
 * 把单个结构信号派发给 route 层提供的回调。
 *
 * - `Record<string, unknown>` → `ActionOption` / `FutureSuggestion` 的类型断言
 *   由 route 层负责单元素业务校验；runtime 不做 zod 校验（终态 parser 的职责）。
 * - 回调的 reject 顺着 await 冒泡（与 onSummaryDelta 一致），runtime catch 会兜底。
 */
async function dispatchStructureSignal(
  signal: StructureSignal,
  options: AgentExecutionOptions | undefined,
): Promise<void> {
  if (signal.kind === 'action') {
    await options?.onActionReady?.(signal.index, signal.action as unknown as ActionOption);
  } else if (signal.kind === 'forecastStarted') {
    await options?.onForecastStarted?.();
  } else {
    await options?.onFutureSuggestionReady?.(
      signal.index,
      signal.suggestion as unknown as FutureSuggestion,
    );
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

/**
 * 纯 UI 控制计划的确定性 envelope。
 *
 * - summary 是固定双语字符串，由 runtime 决定，**不调用** LLM。
 * - statusColor 固定 'good'，source 标记 'planner'，chartTokens 为空。
 * - finishReason 始终 'complete'，因此 Web 客户端会应用 uiDirectives。
 * - uiDirectives 只携带 Planner verifier 通过的 clientAction（一条）。
 */
function toControlUiEnvelope(
  request: AgentRequest,
  plan: AnalysisPlan,
  locale: Locale,
): AgentResponseEnvelope {
  const directive = plan.clientAction!;
  const summary =
    locale === 'en'
      ? controlUiSummaryEn(directive.display)
      : controlUiSummaryZh(directive.display);

  return {
    summary,
    source: 'planner',
    statusColor: 'good',
    chartTokens: [],
    microTips: [],
    uiDirectives: [directive],
    meta: {
      taskType: request.taskType,
      pageContext: request.pageContext,
      finishReason: 'complete',
      sessionId: request.sessionId,
    },
  };
}

function controlUiSummaryZh(
  display: 'hidden' | 'sleep' | 'activity',
): string {
  if (display === 'sleep') return '已在首页展示睡眠趋势简报。';
  if (display === 'activity') return '已在首页展示活动趋势简报。';
  return '已隐藏首页趋势简报。';
}

function controlUiSummaryEn(
  display: 'hidden' | 'sleep' | 'activity',
): string {
  if (display === 'sleep') return 'The Sleep trends brief is now shown on Home.';
  if (display === 'activity') return 'The Activity trends brief is now shown on Home.';
  return 'The Home trends brief is now hidden.';
}

/**
 * 把 Planner verifier 通过的 clientAction 附加到 complete envelope。
 *
 * 仅当 envelope.meta.finishReason === 'complete' 且 plan?.clientAction 存在时返回新对象；
 * fallback / timeout / clarification / safety boundary / customer policy 错误都不调用本 helper。
 *
 * 注意：solver 输出中模型自行编造的 uiDirectives 字段在 parseAgentResponse 阶段
 * 就被丢弃（schema 未声明），本 helper 只信任 plan.clientAction。
 */
function attachVerifiedUiDirective(
  envelope: AgentResponseEnvelope,
  plan: AnalysisPlan | undefined,
): AgentResponseEnvelope {
  if (
    envelope.meta.finishReason !== 'complete' ||
    !plan?.clientAction
  ) {
    return envelope;
  }
  return {
    ...envelope,
    uiDirectives: [plan.clientAction],
  };
}

/**
 * ADVISOR_CHAT 的早返回路径（澄清 / plan 失败 / low_data / parse 失败）必须
 * 也要把本轮「用户输入 + 助手回复」写回 session memory，否则下一轮请求会
 * 因为 recentConversation 为空而退化为单轮问答，丢失对话上下文。
 *
 * 注意：customer-policy 失败（toCustomerPolicyError）刻意不写 memory，
 * 这是 fail-closed 设计，不要在这里统一处理。
 */
function persistChatTurnAndReturn(
  deps: AgentRuntimeDeps,
  request: AgentRequest,
  envelope: AgentResponseEnvelope,
): AgentResponseEnvelope {
  if (request.taskType === AgentTaskType.ADVISOR_CHAT) {
    writeSessionMemory(deps, request, envelope.summary);
  }
  return envelope;
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
  if (plan.userIntent.action === 'create_plan') {
    sections.push('- 响应模式: structured_plan');
    sections.push('- 必须输出完整且符合 schema 的 planDraft');
    sections.push('- chartTokens、microTips 必须为空数组，且不得输出顶层 actions');
    sections.push('- 不得用睡眠数据分析、趋势总结或图表替代结构化计划');
  } else {
    sections.push('- 响应模式: standard');
    sections.push('- 必须完整省略 planDraft 字段');
  }
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

function buildResponseModeRegenerationFeedback(
  responseMode: 'structured_plan' | 'standard',
  locale: Locale,
): string {
  if (responseMode === 'structured_plan') {
    return locale === 'zh'
      ? '## 响应形态校验失败\n本次请求已由 Planner 确认为创建计划。请重新输出完整 planDraft；chartTokens 与 microTips 必须为空数组，不得输出顶层 actions，也不得用健康数据分析或趋势图替代计划。'
      : '## Response mode validation failed\nThe Planner classified this request as plan creation. Regenerate a complete planDraft; chartTokens and microTips must be empty arrays, top-level actions must be omitted, and health analysis or trend charts must not replace the plan.';
  }

  return locale === 'zh'
    ? '## 响应形态校验失败\n本次请求是普通健康问答。请重新输出回答，并完整省略 planDraft 字段。'
    : '## Response mode validation failed\nThis request is a standard health answer. Regenerate the answer and omit the entire planDraft field.';
}

function toStructuredPlanContractError(
  request: AgentRequest,
  locale: Locale,
): AgentResponseEnvelope {
  return {
    summary:
      locale === 'zh'
        ? '暂时无法生成符合结构化契约的计划，请重试。'
        : 'I could not generate a valid structured plan. Please try again.',
    source: 'fallback',
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
function toClarificationResponse(
  request: AgentRequest,
  plan: AnalysisPlan,
  locale: Locale,
): AgentResponseEnvelope {
  const question =
    plan.userIntent.clarificationQuestion ??
    (locale === 'zh'
      ? '能否更具体地描述您的问题？'
      : 'Could you describe your question more specifically?');
  return {
    summary:
      locale === 'zh'
        ? `为了更好地帮助您，我需要更多信息：${question}`
        : `To help you better, I need a little more information: ${question}`,
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

/** Planner 失败时返回不携带任何未经本轮分析验证的数据响应。 */
function toPlannerFailureResponse(request: AgentRequest): AgentResponseEnvelope {
  // Planner 失败时 fail closed：不得附带与本轮问题无关的 profile fallback 图表，
  // 否则会造成“无法理解”但同时展示趋势图的矛盾响应。
  return {
    summary:
      'Sorry, I could not interpret your request. Please describe your health data question more specifically.',
    source: 'fallback',
    statusColor: 'warning',
    chartTokens: [],
    microTips: [],
    actions: [],
    meta: {
      taskType: request.taskType,
      pageContext: request.pageContext,
      finishReason: 'fallback',
      sessionId: request.sessionId,
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
