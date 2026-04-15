import { AgentTaskType, type AgentResponseEnvelope } from '@health-advisor/shared';
import { executeAgent, type AgentRequest } from '@health-advisor/agent-core';
import type { RuntimeRegistry } from '../runtime/registry.js';
import type { MetricsStore } from '../plugins/metrics.js';
import type { BriefCache } from './brief-cache.js';

export interface AiOrchestratorDeps {
  registry: RuntimeRegistry;
  metrics: MetricsStore;
  timeoutMs: number;
  briefCache?: BriefCache;
}

export class AiOrchestrator {
  constructor(private deps: AiOrchestratorDeps) {}

  async execute(request: AgentRequest): Promise<AgentResponseEnvelope> {
    // 对 HOMEPAGE_SUMMARY 检查 brief 缓存
    if (request.taskType === AgentTaskType.HOMEPAGE_SUMMARY && this.deps.briefCache) {
      const cached = this.deps.briefCache.get(request.profileId);
      if (cached) {
        this.deps.metrics.incrementBriefCacheHit();
        return cached;
      }
    }

    try {
      const result = await executeAgent(
        request,
        this.deps.registry,
        this.deps.timeoutMs,
      );

      if (result.meta.finishReason === 'timeout') {
        this.deps.metrics.incrementAiTimeout();
      }
      if (result.meta.finishReason === 'fallback') {
        this.deps.metrics.incrementFallbackUsed();
      }

      // LLM 调用成功后写入 brief 缓存
      if (request.taskType === AgentTaskType.HOMEPAGE_SUMMARY && this.deps.briefCache && result.meta.finishReason === 'complete') {
        this.deps.briefCache.set(request.profileId, result);
      }

      return result;
    } catch (error) {
      this.deps.metrics.incrementProviderError();
      throw error;
    }
  }
}
