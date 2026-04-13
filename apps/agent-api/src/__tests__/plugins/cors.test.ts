import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../../config/env';
import { corsPlugin } from '../../plugins/cors';

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
