import fp from 'fastify-plugin';
import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AiExecutionTimings } from '../services/ai-orchestrator.js';

/** AI 路由的额外日志字段 */
export interface AiRequestMeta {
  provider: string;
  model: string;
  finishReason: string;
  fallbackTriggered: boolean;
  timings?: AiExecutionTimings;
}

export interface RequestContext {
  requestId: string;
  sessionId: string;
  profileId?: string;
  startTime: number;
  /** AI 路由设置：provider/model/finishReason/fallbackTriggered */
  aiMeta?: AiRequestMeta;
}

declare module 'fastify' {
  interface FastifyRequest {
    ctx: RequestContext;
  }
}

export const requestContextPlugin = fp(async function (app: FastifyInstance) {
  app.addHook('onRequest', async (request: FastifyRequest) => {
    const requestId = (request.headers['x-request-id'] as string) || crypto.randomUUID();
    const sessionId =
      (request.headers['x-session-id'] as string) || `session-${crypto.randomUUID()}`;
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
    // 防御：AI 路由的成功路径（2xx）应该设置 aiMeta，若缺失说明 attachAiLogMeta
    // 时序被打乱（例如 SSE route 的 writeTerminal 在 setAiMeta 前触发
    // reply.raw.end，导致 onResponse 在 aiMeta 赋值前读取）。此时 request
    // completed 日志会静默缺失 provider/model/finishReason/timings 字段，
    // 记录 warn 以便定位。
    //
    // 只在成功路径告警：4xx 校验失败本就不会调用 attachAiLogMeta（设计如此），
    // 告警会产生噪音且无诊断价值。
    if (!request.ctx.aiMeta && request.url.includes('/ai/') && reply.statusCode < 400) {
      request.log.warn(
        {
          requestId: request.ctx.requestId,
          route: request.url,
          statusCode: reply.statusCode,
        },
        'AI route completed without aiMeta — log fields may be incomplete',
      );
    }
    request.log.info(
      {
        requestId: request.ctx.requestId,
        route: request.url,
        method: request.method,
        statusCode: reply.statusCode,
        durationMs,
        sessionId: request.ctx.sessionId,
        profileId: request.ctx.profileId,
        ...request.ctx.aiMeta,
      },
      'request completed',
    );
  });
});
