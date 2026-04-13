import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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

  it('无 session header 时自动签发 sessionId', async () => {
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.sessionId).toBe('string');
    expect(body.sessionId.startsWith('session-')).toBe(true);
    expect(body.profileId).toBeUndefined();
    expect(res.headers['x-session-id']).toBe(body.sessionId);
  });

  it('onResponse 日志包含 sessionId 和 profileId', async () => {
    const logSpy = vi.spyOn(app.log, 'info');
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { 'x-session-id': 'sess-log', 'x-profile-id': 'p-log' },
    });
    expect(res.statusCode).toBe(200);

    // 找到 'request completed' 日志调用
    const logCall = logSpy.mock.calls.find((args) => args[1] === 'request completed');
    expect(logCall).toBeDefined();
    const logObj = logCall![0] as Record<string, unknown>;
    expect(logObj.sessionId).toBe('sess-log');
    expect(logObj.profileId).toBe('p-log');
    expect(logObj.durationMs).toBeDefined();
    expect(typeof logObj.durationMs).toBe('number');

    logSpy.mockRestore();
  });

  it('aiMeta 附加后出现在 onResponse 日志', async () => {
    // 需要单独实例以注册额外路由
    const testApp = Fastify();
    await testApp.register(requestContextPlugin);
    testApp.get('/ai-test', async (request: any) => {
      request.ctx.aiMeta = {
        provider: 'openai',
        model: 'gpt-4o-mini',
        finishReason: 'complete',
        fallbackTriggered: false,
      };
      return { ok: true };
    });
    await testApp.ready();

    const logSpy = vi.spyOn(testApp.log, 'info');

    const res = await testApp.inject({ method: 'GET', url: '/ai-test' });
    expect(res.statusCode).toBe(200);

    const logCall = logSpy.mock.calls.find((args) => args[1] === 'request completed');
    expect(logCall).toBeDefined();
    const logObj = logCall![0] as Record<string, unknown>;
    expect(logObj.provider).toBe('openai');
    expect(logObj.model).toBe('gpt-4o-mini');
    expect(logObj.finishReason).toBe('complete');
    expect(logObj.fallbackTriggered).toBe(false);

    logSpy.mockRestore();
    await testApp.close();
  });
});
