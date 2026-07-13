import crypto from 'node:crypto';
import { AgentTaskType, type AgentResponseEnvelope, type Locale } from '@health-advisor/shared';
import {
  executeAgent,
  type AgentRequest,
  type AgentRuntimeObserver,
} from '@health-advisor/agent-core';
import type { RuntimeRegistry } from '../runtime/registry.js';
import type { MetricsStore } from '../plugins/metrics.js';
import type { MemoryServices } from '../runtime/memory-services.js';
import { buildAgentCacheIdentity } from './agent-cache-identity.js';

export interface AiOrchestratorDeps {
  registry: RuntimeRegistry;
  metrics: MetricsStore;
  timeoutMs: number;
  memoryServices: MemoryServices;
  modelVersion: string;
}

/**
 * 单个 AI 请求的关键阶段耗时。所有值单位均为毫秒，未执行的阶段省略。
 * 该结构会写入 Render 的 request completed 日志，便于直接定位慢点。
 *
 * 流式传输新增字段（仅 cache miss 且传入 onSummaryDelta 时填充）：
 * - `llmFirstTokenMs`：从 agent 开始到首个 summary delta 的时间。
 * - `streamChunkCount`：onSummaryDelta 被调用的总次数。
 * - `streamDurationMs`：从 agent 开始到 executeAgent 返回的时间（与 agentMs 等价，
 *   独立命名以便日志层区分流式与非流式）。
 *
 * cache hit 时这三个字段均为 undefined。
 */
export interface AiExecutionTimings {
  routePreparationMs?: number;
  cacheLookupMs?: number;
  cacheHit?: boolean;
  contextMs?: number;
  rulesMs?: number;
  packetMs?: number;
  promptBuildMs?: number;
  llmMs?: number;
  postProcessMs?: number;
  syncGateMs?: number;
  contentPolicyChecks?: Array<{
    phase: 'initial' | 'regeneration' | 'sync-regeneration';
    approved: boolean;
    violationCodes: string[];
  }>;
  agentMs?: number;
  cacheWriteMs?: number;
  orchestrationMs: number;
  /** 流式首 token 时延（从 agent 开始到首个 delta） */
  llmFirstTokenMs?: number;
  /** onSummaryDelta 调用次数 */
  streamChunkCount?: number;
  /** 流式总时长（从 agent 开始到 executeAgent 返回） */
  streamDurationMs?: number;
}

export interface AiOrchestratorExecuteOptions {
  onTimings?(timings: AiExecutionTimings): void;
  /**
   * 外部取消信号（如 HTTP 请求断开）。透传给 executeAgent，与 runtime 内部
   * timeout signal 合并，任一触发即终止底层 provider iterator。
   *
   * 仅 cache miss 时有效；cache hit 直接返回，不消耗 signal。
   */
  signal?: AbortSignal;
  /**
   * summary 增量回调。仅 cache miss 时透传给 executeAgent（每个 delta 都 await），
   * 用于把 runtime delta 推送到 SSE writer；cache hit 不调用（不伪造 delta）。
   */
  onSummaryDelta?(delta: string): void | Promise<void>;
}

function cacheableTask(taskType: AgentTaskType): boolean {
  return taskType === AgentTaskType.HOMEPAGE_SUMMARY || taskType === AgentTaskType.VIEW_SUMMARY;
}

export class AiOrchestrator {
  constructor(private deps: AiOrchestratorDeps) {}

  async execute(
    request: AgentRequest,
    locale?: Locale,
    options?: AiOrchestratorExecuteOptions,
  ): Promise<AgentResponseEnvelope> {
    const startedAt = performance.now();
    const timings: AiExecutionTimings = { orchestrationMs: 0 };
    const cacheIdentity = cacheableTask(request.taskType)
      ? buildAgentCacheIdentity({
          request,
          locale,
          registry: this.deps.registry,
          promptVersion: 'memory-upgrade-v1',
          modelVersion: this.deps.modelVersion,
        })
      : undefined;

    try {
      if (cacheIdentity) {
        const cacheStartedAt = performance.now();
        const cached = await this.deps.memoryServices.cache.get({
          ...cacheIdentity,
          profileId: request.profileId,
          now: Date.now(),
        });
        timings.cacheLookupMs = Math.round(performance.now() - cacheStartedAt);
        if (cached) {
          timings.cacheHit = true;
          this.deps.metrics.incrementBriefCacheHit();
          return {
            ...(cached.payload as unknown as AgentResponseEnvelope),
            meta: { ...(cached.payload as unknown as AgentResponseEnvelope).meta, finishReason: 'cached' },
          };
        }
      }

      const phaseTimings = createRuntimeTimingObserver(startedAt);
      const agentStartedAt = performance.now();

      // 流式计时：只在 cache miss + 传了 onSummaryDelta 时记录
      // llmFirstTokenMs 在首个 delta 到达时计算；streamChunkCount 每次 delta 自增；
      // streamDurationMs 在 executeAgent 返回后计算。
      const onSummaryDelta = options?.onSummaryDelta;
      const streamEnabled = typeof onSummaryDelta === 'function';
      let firstTokenRecorded = false;
      const wrappedOnSummaryDelta: ((delta: string) => void | Promise<void>) | undefined =
        streamEnabled
          ? (delta: string) => {
              if (!firstTokenRecorded) {
                timings.llmFirstTokenMs = Math.round(performance.now() - agentStartedAt);
                firstTokenRecorded = true;
              }
              timings.streamChunkCount = (timings.streamChunkCount ?? 0) + 1;
              return onSummaryDelta(delta);
            }
          : undefined;

      const result = await executeAgent(
        request,
        this.deps.registry,
        this.deps.timeoutMs,
        phaseTimings.observer,
        locale,
        {
          ...(options?.signal ? { signal: options.signal } : {}),
          ...(wrappedOnSummaryDelta ? { onSummaryDelta: wrappedOnSummaryDelta } : {}),
        },
      );
      timings.agentMs = Math.round(performance.now() - agentStartedAt);
      if (streamEnabled) {
        timings.streamDurationMs = timings.agentMs;
      }
      Object.assign(timings, phaseTimings.snapshot());

      if (result.meta.finishReason === 'timeout') {
        this.deps.metrics.incrementAiTimeout();
      }
      if (result.meta.finishReason === 'fallback') {
        this.deps.metrics.incrementFallbackUsed();
      }

      if (cacheIdentity && result.meta.finishReason === 'complete') {
        const cacheWriteStartedAt = performance.now();
        await this.deps.memoryServices.cache.set({
          id: crypto.randomUUID(),
          ...cacheIdentity,
          profileId: request.profileId,
          sessionId: request.sessionId,
          pageContext: request.pageContext as Record<string, unknown>,
          payload: result as unknown as Record<string, unknown>,
          createdAt: Date.now(),
          expiresAt: Date.now() + 2 * 60 * 60 * 1000,
        });
        timings.cacheWriteMs = Math.round(performance.now() - cacheWriteStartedAt);
      }

      return result;
    } catch (error) {
      this.deps.metrics.incrementProviderError();
      throw error;
    } finally {
      timings.orchestrationMs = Math.round(performance.now() - startedAt);
      options?.onTimings?.(timings);
    }
  }
}

type RuntimePhaseTimings = Omit<
  AiExecutionTimings,
  'cacheLookupMs' | 'cacheHit' | 'agentMs' | 'cacheWriteMs' | 'orchestrationMs'
>;

function createRuntimeTimingObserver(startedAt: number): {
  observer: AgentRuntimeObserver;
  snapshot: () => RuntimePhaseTimings;
} {
  let contextBuiltAt: number | undefined;
  let rulesEvaluatedAt: number | undefined;
  let packetBuiltAt: number | undefined;
  let promptBuiltAt: number | undefined;
  let modelOutputAt: number | undefined;
  let parsedAt: number | undefined;
  let verifiedAt: number | undefined;
  let syncGateStartedAt: number | undefined;
  const timings: RuntimePhaseTimings = {};

  const now = () => performance.now();
  const elapsed = (from: number) => Math.round(now() - from);

  return {
    observer: {
      onContextBuilt: () => {
        contextBuiltAt = now();
        timings.contextMs = Math.round(contextBuiltAt - startedAt);
      },
      onRulesEvaluated: () => {
        rulesEvaluatedAt = now();
        if (contextBuiltAt !== undefined) timings.rulesMs = Math.round(rulesEvaluatedAt - contextBuiltAt);
      },
      onPacketBuilt: () => {
        packetBuiltAt = now();
        if (rulesEvaluatedAt !== undefined) timings.packetMs = Math.round(packetBuiltAt - rulesEvaluatedAt);
      },
      onPromptBuilt: () => {
        promptBuiltAt = now();
        if (packetBuiltAt !== undefined) timings.promptBuildMs = Math.round(promptBuiltAt - packetBuiltAt);
      },
      onModelOutput: () => {
        modelOutputAt = now();
        if (promptBuiltAt !== undefined) timings.llmMs = Math.round(modelOutputAt - promptBuiltAt);
      },
      onCustomerPolicyEvaluated: (check) => {
        const checks = timings.contentPolicyChecks ?? [];
        checks.push(check);
        timings.contentPolicyChecks = checks;
      },
      onParsed: () => {
        parsedAt = now();
        if (modelOutputAt !== undefined) timings.postProcessMs = Math.round(parsedAt - modelOutputAt);
      },
      onVerified: () => {
        verifiedAt = now();
        syncGateStartedAt = verifiedAt;
      },
      onSyncGate: () => {
        if (syncGateStartedAt !== undefined) timings.syncGateMs = elapsed(syncGateStartedAt);
      },
    },
    snapshot: () => {
      // 模型超时/连接错误时不会触发 onModelOutput；仍将从 prompt 构建到
      // Agent 结束的时间归入 llmMs，保证慢请求在 Render 日志中可定位。
      if (promptBuiltAt !== undefined && modelOutputAt === undefined && timings.llmMs === undefined) {
        timings.llmMs = Math.round(now() - promptBuiltAt);
      }
      return timings;
    },
  };
}
