import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { requestContextPlugin } from '../../plugins/request-context';
import { metricsPlugin } from '../../plugins/metrics';

describe('metricsPlugin', () => {
  let app: Awaited<ReturnType<typeof Fastify>>;

  beforeAll(async () => {
    app = Fastify();
    await app.register(requestContextPlugin);
    await app.register(metricsPlugin);

    app.get('/test', async () => ({ ok: true }));
    app.get('/fail', async () => {
      throw new Error('fail');
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('初始快照 totalRequests 为 0', () => {
    const snap = app.metrics.snapshot();
    expect(snap.totalRequests).toBe(0);
    expect(snap.aiTimeouts).toBe(0);
  });

  it('请求后 totalRequests 增加', async () => {
    await app.inject({ method: 'GET', url: '/test' });
    await app.inject({ method: 'GET', url: '/test' });
    const snap = app.metrics.snapshot();
    expect(snap.totalRequests).toBe(2);
  });

  it('记录路由延迟', async () => {
    await app.inject({ method: 'GET', url: '/test' });
    const snap = app.metrics.snapshot();
    const entry = snap.latencyByRoute['/test'];
    expect(entry).toBeDefined();
    expect(entry.count).toBeGreaterThan(0);
    expect(entry.sum).toBeGreaterThanOrEqual(0);
  });

  it('手动增加 AI 超时计数', () => {
    app.metrics.incrementAiTimeout();
    app.metrics.incrementAiTimeout();
    expect(app.metrics.snapshot().aiTimeouts).toBe(2);
  });

  it('手动增加 fallback 计数', () => {
    app.metrics.incrementFallbackUsed();
    expect(app.metrics.snapshot().fallbackUsed).toBe(1);
  });

  it('手动增加 provider 错误计数', () => {
    app.metrics.incrementProviderError();
    expect(app.metrics.snapshot().providerErrors).toBe(1);
  });
});
