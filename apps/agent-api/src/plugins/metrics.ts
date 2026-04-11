import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export interface MetricsSnapshot {
  apiRequests: Record<string, Record<number, number>>;
  aiTimeouts: number;
  fallbackUsed: number;
  providerErrors: number;
  latencyByRoute: Record<string, { sum: number; count: number }>;
  totalRequests: number;
  startTime: string;
}

export interface MetricsStore {
  incrementApiRequests(route: string, status: number): void;
  incrementAiTimeout(): void;
  incrementFallbackUsed(): void;
  incrementProviderError(): void;
  recordLatency(route: string, durationMs: number): void;
  snapshot(): MetricsSnapshot;
}

function createMetricsStore(): MetricsStore {
  const apiRequests = new Map<string, Map<number, number>>();
  let aiTimeouts = 0;
  let fallbackUsed = 0;
  let providerErrors = 0;
  const latencyByRoute = new Map<string, { sum: number; count: number }>();
  const startTime = new Date().toISOString();

  return {
    incrementApiRequests(route: string, status: number) {
      let statusMap = apiRequests.get(route);
      if (!statusMap) {
        statusMap = new Map();
        apiRequests.set(route, statusMap);
      }
      statusMap.set(status, (statusMap.get(status) ?? 0) + 1);
    },
    incrementAiTimeout() { aiTimeouts++; },
    incrementFallbackUsed() { fallbackUsed++; },
    incrementProviderError() { providerErrors++; },
    recordLatency(route: string, durationMs: number) {
      const entry = latencyByRoute.get(route);
      if (entry) {
        entry.sum += durationMs;
        entry.count += 1;
      } else {
        latencyByRoute.set(route, { sum: durationMs, count: 1 });
      }
    },
    snapshot(): MetricsSnapshot {
      const requests: Record<string, Record<number, number>> = {};
      for (const [route, statusMap] of apiRequests) {
        requests[route] = Object.fromEntries(statusMap);
      }
      const latency: Record<string, { sum: number; count: number }> = {};
      for (const [route, entry] of latencyByRoute) {
        latency[route] = { ...entry };
      }
      let totalRequests = 0;
      for (const statusMap of apiRequests.values()) {
        for (const count of statusMap.values()) totalRequests += count;
      }
      return {
        apiRequests: requests,
        aiTimeouts,
        fallbackUsed,
        providerErrors,
        latencyByRoute: latency,
        totalRequests,
        startTime,
      };
    },
  };
}

declare module 'fastify' {
  interface FastifyInstance {
    metrics: MetricsStore;
  }
}

export const metricsPlugin = fp(async function (app: FastifyInstance) {
  const store = createMetricsStore();
  app.decorate('metrics', store);

  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const route = request.routeOptions.url ?? request.url;
    store.incrementApiRequests(route, reply.statusCode);
    const durationMs = Math.round(performance.now() - (request.ctx?.startTime ?? performance.now()));
    store.recordLatency(route, durationMs);
  });
});
