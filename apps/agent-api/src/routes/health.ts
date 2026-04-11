import type { FastifyInstance } from 'fastify';
import { createSuccessResponse } from '@health-advisor/shared';
import type { ApiMeta } from '@health-advisor/shared';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async (request) => {
    const config = app.config;
    const startTime = request.ctx?.startTime ?? performance.now();
    const meta: ApiMeta = {
      timestamp: new Date().toISOString(),
      requestId: request.ctx?.requestId ?? request.id,
      durationMs: Math.round(performance.now() - startTime),
    };

    return createSuccessResponse({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.0.0',
      env: config.NODE_ENV,
      provider: config.LLM_PROVIDER,
      fallbackOnly: config.FALLBACK_ONLY_MODE,
      profilesLoaded: app.runtime.profiles.size,
      uptimeMs: Math.round(process.uptime() * 1000),
    }, meta);
  });
}
