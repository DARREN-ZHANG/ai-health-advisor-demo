import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../../config/env';
import { corsPlugin, resolveCorsHeaders } from '../../plugins/cors';

describe('corsPlugin', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(corsPlugin, {
      config: loadConfig({
        FALLBACK_ONLY_MODE: 'true',
        NODE_ENV: 'production',
        CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
      }),
    });
    app.get('/test', async (_request, reply) => {
      reply.header('X-Session-Id', 'sess-from-server');
      return { ok: true };
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('在允许的跨域来源下暴露 session 头', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: {
        origin: 'http://localhost:3000',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-expose-headers']).toContain('X-Session-Id');
    expect(response.headers['x-session-id']).toBe('sess-from-server');
  });

  it('未配置来源时不返回 allow-origin', async () => {
    const noCorsApp = Fastify();
    await noCorsApp.register(corsPlugin, {
      config: loadConfig({
        FALLBACK_ONLY_MODE: 'true',
        NODE_ENV: 'production',
      }),
    });
    noCorsApp.get('/test', async () => ({ ok: true }));
    await noCorsApp.ready();

    const response = await noCorsApp.inject({
      method: 'GET',
      url: '/test',
      headers: {
        origin: 'http://localhost:3000',
      },
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();

    await noCorsApp.close();
  });
});

/**
 * resolveCorsHeaders 是 hijack 后的 SSE route 手动注入 CORS headers 的关键 helper。
 * 与 @fastify/cors 在 onSend 的注入共享同一份白名单（buildAllowedOrigins），
 * 必须保证白名单内/外/无 origin 三种情况的行为与普通 JSON route 一致。
 */
describe('resolveCorsHeaders', () => {
  const prodConfig = loadConfig({
    FALLBACK_ONLY_MODE: 'true',
    NODE_ENV: 'production',
    CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
  });

  it('白名单内的 origin 返回完整 CORS headers', () => {
    const headers = resolveCorsHeaders('http://localhost:3000', prodConfig);
    expect(headers).toEqual({
      'Access-Control-Allow-Origin': 'http://localhost:3000',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Expose-Headers': 'X-Session-Id',
      Vary: 'Origin',
    });
  });

  it('不在白名单的 origin 返回空对象（不发 CORS 头）', () => {
    const headers = resolveCorsHeaders('http://evil.example.com', prodConfig);
    expect(headers).toEqual({});
  });

  it('无 origin（同源请求）返回空对象', () => {
    const headers = resolveCorsHeaders(undefined, prodConfig);
    expect(headers).toEqual({});
  });

  it('development 模式自动放行 localhost:3000 与 localhost:5173', () => {
    const devConfig = loadConfig({
      FALLBACK_ONLY_MODE: 'true',
      NODE_ENV: 'development',
    });
    expect(resolveCorsHeaders('http://localhost:3000', devConfig)['Access-Control-Allow-Origin'])
      .toBe('http://localhost:3000');
    expect(resolveCorsHeaders('http://localhost:5173', devConfig)['Access-Control-Allow-Origin'])
      .toBe('http://localhost:5173');
  });

  it('未配置任何白名单时不放行任意 origin', () => {
    const emptyConfig = loadConfig({
      FALLBACK_ONLY_MODE: 'true',
      NODE_ENV: 'production',
    });
    expect(resolveCorsHeaders('http://localhost:3000', emptyConfig)).toEqual({});
  });
});
