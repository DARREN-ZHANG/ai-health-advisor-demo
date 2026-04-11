import type { RuntimeRegistry } from '../runtime/registry.js';
import type { AppConfig } from '../config/env.js';
import type { MetricsStore } from '../plugins/metrics.js';
import type { RequestContext } from '../plugins/request-context.js';

declare module 'fastify' {
  interface FastifyInstance {
    runtime: RuntimeRegistry;
    config: AppConfig;
    metrics: MetricsStore;
  }

  interface FastifyRequest {
    ctx: RequestContext;
  }
}
