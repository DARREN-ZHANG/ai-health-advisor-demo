import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { ErrorCode, createErrorResponse } from '@health-advisor/shared';
import { TimeoutError } from '@health-advisor/agent-core';
import { buildMeta } from '../utils/meta.js';

export const errorHandlerPlugin = fp(async function (app: FastifyInstance) {
  app.setErrorHandler(
    (error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
      const meta = buildMeta(request);

      if (error instanceof ZodError) {
        const message = error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
        reply.status(400);
        return reply.send(createErrorResponse(ErrorCode.VALIDATION_ERROR, message, meta));
      }

      if (error instanceof TimeoutError) {
        reply.status(504);
        return reply.send(createErrorResponse(ErrorCode.AGENT_TIMEOUT, error.message, meta));
      }

      if ('statusCode' in error && (error as FastifyError).statusCode === 404) {
        reply.status(404);
        return reply.send(createErrorResponse(ErrorCode.NOT_FOUND, error.message, meta));
      }

      // 未知错误
      request.log.error({ error, requestId: request.ctx?.requestId }, 'unhandled error');
      reply.status(500);
      return reply.send(createErrorResponse(ErrorCode.UNKNOWN, '内部服务错误', meta));
    },
  );
});
