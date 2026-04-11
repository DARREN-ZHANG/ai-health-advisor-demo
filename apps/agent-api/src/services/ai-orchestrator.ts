import type { AgentResponseEnvelope } from '@health-advisor/shared';
import { executeAgent, type AgentRequest } from '@health-advisor/agent-core';
import type { RuntimeRegistry } from '../runtime/registry.js';
import type { MetricsStore } from '../plugins/metrics.js';

export interface AiOrchestratorDeps {
  registry: RuntimeRegistry;
  metrics: MetricsStore;
  timeoutMs: number;
}

export class AiOrchestrator {
  constructor(private deps: AiOrchestratorDeps) {}

  async execute(request: AgentRequest): Promise<AgentResponseEnvelope> {
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

      return result;
    } catch (error) {
      this.deps.metrics.incrementProviderError();
      throw error;
    }
  }
}
