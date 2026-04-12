import type { FastifyInstance } from 'fastify';
import { createSuccessResponse, createErrorResponse, ErrorCode } from '@health-advisor/shared';
import { buildMeta } from '../../utils/meta.js';
import { ProfileService } from './service.js';

export async function profileRoutes(app: FastifyInstance) {
  const service = new ProfileService(app.runtime);

  app.get('/profiles', async (request) => {
    const profiles = service.listProfiles();
    return createSuccessResponse(profiles, buildMeta(request));
  });

  app.get<{ Params: { profileId: string } }>('/profiles/:profileId', async (request, reply) => {
    const { profileId } = request.params;
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
