import fp from 'fastify-plugin';
import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export interface RequestContext {
  requestId: string;
  sessionId?: string;
  profileId?: string;
  startTime: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    ctx: RequestContext;
  }
}

export const requestContextPlugin = fp(async function (app: FastifyInstance) {
  app.addHook('onRequest', async (request: FastifyRequest) => {
    const requestId =
      (request.headers['x-request-id'] as string) || crypto.randomUUID();
    const sessionId = (request.headers['x-session-id'] as string) || `session-${crypto.randomUUID()}`;
    const profileId = request.headers['x-profile-id'] as string | undefined;

    request.id = requestId;
    request.ctx = {
      requestId,
      sessionId,
      profileId,
      startTime: performance.now(),
    };
  });

  app.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload) => {
    reply.header('X-Session-Id', request.ctx.sessionId);
    return payload;
  });

  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const durationMs = Math.round(performance.now() - request.ctx.startTime);
    request.log.info(
      { requestId: request.ctx.requestId, route: request.url, method: request.method, statusCode: reply.statusCode, durationMs },
      'request completed',
    );
  });
});
