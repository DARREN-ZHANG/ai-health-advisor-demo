import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/env.js';

/**
 * 构造允许的 Origin 白名单 Set。
 *
 * 抽成独立 helper 的意图:
 * - corsPlugin 注册 @fastify/cors 时需要白名单数组
 * - hijack 的 SSE route 绕过 @fastify/cors 的 onSend hook,需要手动校验 Origin
 *   并写入 CORS headers,共用同一份白名单逻辑避免漂移
 */
export function buildAllowedOrigins(config: AppConfig): Set<string> {
  const allowedOrigins = new Set(config.CORS_ALLOWED_ORIGINS);
  if (config.NODE_ENV === 'development') {
    allowedOrigins.add('http://localhost:3000');
    allowedOrigins.add('http://localhost:5173');
  }
  return allowedOrigins;
}

/**
 * 根据 request 的 Origin 解析应当写入响应的 CORS headers。
 *
 * 用于 reply.hijack() 后的 SSE route:@fastify/cors 的 onSend hook 在 hijack
 * 后不触发,因此 SSE 响应需要手动写入 CORS headers。这里复用 buildAllowedOrigins
 * 的白名单,保持与 @fastify/cors 的非 hijack 路由行为一致。
 *
 * - origin 不存在(同源请求) → 返回空对象(不发 CORS 头)
 * - origin 不在白名单 → 返回空对象(不发 CORS 头)
 * - origin 在白名单 → 返回完整的 CORS headers(Allow-Origin + Credentials +
 *   Expose-Headers + Vary)
 */
export function resolveCorsHeaders(
  origin: string | undefined,
  config: AppConfig,
): Record<string, string> {
  if (!origin || !buildAllowedOrigins(config).has(origin)) {
    return {};
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Expose-Headers': 'X-Session-Id',
    Vary: 'Origin',
  };
}

export const corsPlugin = fp<{
  config: AppConfig;
}>(
  async function (app: FastifyInstance, opts) {
    const { config } = opts;
    const allowedOrigins = buildAllowedOrigins(config);

    await app.register(cors, {
      origin: allowedOrigins.size > 0 ? [...allowedOrigins] : false,
      credentials: true,
      exposedHeaders: ['X-Session-Id'],
      methods: ['GET', 'PUT', 'POST', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
    });

    await app.register(helmet, {
      contentSecurityPolicy: false,
    });
  },
  { name: 'cors-plugin' },
);
