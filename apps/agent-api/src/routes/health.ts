import type { FastifyInstance } from 'fastify';
import { createSuccessResponse } from '@health-advisor/shared';
import { buildMeta } from '../utils/meta.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async (request) => {
    const config = app.config;

    return createSuccessResponse({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.0.0',
      env: config.NODE_ENV,
      provider: config.LLM_PROVIDER,
      fallbackOnly: config.FALLBACK_ONLY_MODE,
      profilesLoaded: app.runtime.profiles.size,
      uptimeMs: Math.round(process.uptime() * 1000),
    }, buildMeta(request));
  });
}
