import crypto from 'node:crypto';
import { AgentTaskType, type AgentResponseEnvelope, type Locale } from '@health-advisor/shared';
import { executeAgent, type AgentRequest } from '@health-advisor/agent-core';
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

function cacheableTask(taskType: AgentTaskType): boolean {
  return taskType === AgentTaskType.HOMEPAGE_SUMMARY || taskType === AgentTaskType.VIEW_SUMMARY;
}

export class AiOrchestrator {
  constructor(private deps: AiOrchestratorDeps) {}

  async execute(request: AgentRequest, locale?: Locale): Promise<AgentResponseEnvelope> {
    const cacheIdentity = cacheableTask(request.taskType)
      ? buildAgentCacheIdentity({
          request,
          locale,
          registry: this.deps.registry,
          promptVersion: 'memory-upgrade-v1',
          modelVersion: this.deps.modelVersion,
        })
      : undefined;

    if (cacheIdentity) {
      const cached = await this.deps.memoryServices.cache.get({
        ...cacheIdentity,
        profileId: request.profileId,
        now: Date.now(),
      });
      if (cached) {
        this.deps.metrics.incrementBriefCacheHit();
        return {
          ...(cached.payload as unknown as AgentResponseEnvelope),
          meta: { ...(cached.payload as unknown as AgentResponseEnvelope).meta, finishReason: 'cached' },
        };
      }
    }

    try {
      const result = await executeAgent(
        request,
        this.deps.registry,
        this.deps.timeoutMs,
        undefined,
        locale,
      );

      if (result.meta.finishReason === 'timeout') {
        this.deps.metrics.incrementAiTimeout();
      }
      if (result.meta.finishReason === 'fallback') {
        this.deps.metrics.incrementFallbackUsed();
      }

      if (cacheIdentity && result.meta.finishReason === 'complete') {
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
      }

      return result;
    } catch (error) {
      this.deps.metrics.incrementProviderError();
      throw error;
    }
  }
}
