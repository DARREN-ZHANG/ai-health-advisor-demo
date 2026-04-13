import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { requestContextPlugin } from '../../plugins/request-context';
import { errorHandlerPlugin } from '../../plugins/error-handler';

describe('errorHandlerPlugin', () => {
  let app: Awaited<ReturnType<typeof Fastify>>;

  beforeAll(async () => {
    app = Fastify();
    await app.register(requestContextPlugin);
    await app.register(errorHandlerPlugin);

    app.get('/zod-error', async () => {
      throw new ZodError([
        { code: 'invalid_type', expected: 'string', received: 'number', path: ['name'], message: 'Expected string' },
      ]);
    });

    app.get('/generic-error', async () => {
      throw new Error('Something went wrong');
    });

    app.get('/ok', async () => ({ ok: true }));

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('ZodError 返回 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({ method: 'GET', url: '/zod-error' });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('name');
  });

  it('通用错误返回 500 UNKNOWN', async () => {
    const res = await app.inject({ method: 'GET', url: '/generic-error' });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNKNOWN');
  });

  it('正常请求返回 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/ok' });
    expect(res.statusCode).toBe(200);
  });

  it('错误响应包含 meta.requestId', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/zod-error',
      headers: { 'x-request-id': 'test-req-id' },
    });
    const body = res.json();
    expect(body.meta.requestId).toBe('test-req-id');
    expect(body.meta.timestamp).toBeDefined();
    expect(typeof body.meta.durationMs).toBe('number');
  });
});
