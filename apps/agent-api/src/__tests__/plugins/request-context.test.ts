import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { requestContextPlugin } from '../../plugins/request-context';

describe('requestContextPlugin', () => {
  let app: Awaited<ReturnType<typeof Fastify>>;

  beforeAll(async () => {
    app = Fastify();
    await app.register(requestContextPlugin);
    app.get('/test', async (request: any) => ({
      requestId: request.ctx.requestId,
      sessionId: request.ctx.sessionId,
      profileId: request.ctx.profileId,
    }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('自动生成 requestId', async () => {
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.requestId).toBeDefined();
    expect(typeof body.requestId).toBe('string');
  });

  it('保留 x-request-id header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { 'x-request-id': 'custom-id-123' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().requestId).toBe('custom-id-123');
  });

  it('提取 x-session-id 和 x-profile-id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { 'x-session-id': 'sess-1', 'x-profile-id': 'profile-a' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sessionId).toBe('sess-1');
    expect(body.profileId).toBe('profile-a');
  });

  it('无 session/profile header 时为 undefined', async () => {
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sessionId).toBeUndefined();
    expect(body.profileId).toBeUndefined();
  });
});
