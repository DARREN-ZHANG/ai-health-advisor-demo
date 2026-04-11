import type { FastifyInstance } from 'fastify';
import { createSuccessResponse, createErrorResponse, ErrorCode } from '@health-advisor/shared';
import { ProfileService } from './service.js';
import type { ApiMeta } from '@health-advisor/shared';

function buildMeta(request: { ctx?: { requestId: string; startTime: number }; id: string }): ApiMeta {
  const startTime = request.ctx?.startTime ?? performance.now();
  return {
    timestamp: new Date().toISOString(),
    requestId: request.ctx?.requestId ?? request.id,
    durationMs: Math.round(performance.now() - startTime),
  };
}

export async function profileRoutes(app: FastifyInstance) {
  app.get('/profiles', async (request) => {
    const service = new ProfileService(app.runtime);
    const profiles = service.listProfiles();
    return createSuccessResponse(profiles, buildMeta(request));
  });

  app.get<{ Params: { profileId: string } }>('/profiles/:profileId', async (request, reply) => {
    const { profileId } = request.params;
    const service = new ProfileService(app.runtime);
    try {
      const profile = service.getProfile(profileId);
      return createSuccessResponse(profile, buildMeta(request));
    } catch {
      return reply.status(404).send(
        createErrorResponse(ErrorCode.PROFILE_NOT_FOUND, `Profile ${profileId} not found`, buildMeta(request)),
      );
    }
  });
}
