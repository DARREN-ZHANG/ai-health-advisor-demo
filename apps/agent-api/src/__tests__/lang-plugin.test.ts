import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { langPlugin } from '../plugins/lang-plugin';

describe('langPlugin', () => {
  it('从 X-Lang header 解析 locale', async () => {
    const app = Fastify();
    await app.register(langPlugin);
    app.get('/test', async (request) => ({ lang: request.lang }));
    const res = await app.inject({ method: 'GET', url: '/test', headers: { 'x-lang': 'en' } });
    expect(res.json()).toEqual({ lang: 'en' });
  });

  it('非法值回退到 zh', async () => {
    const app = Fastify();
    await app.register(langPlugin);
    app.get('/test', async (request) => ({ lang: request.lang }));
    const res = await app.inject({ method: 'GET', url: '/test', headers: { 'x-lang': 'fr' } });
    expect(res.json()).toEqual({ lang: 'zh' });
  });

  it('无 header 时默认 zh', async () => {
    const app = Fastify();
    await app.register(langPlugin);
    app.get('/test', async (request) => ({ lang: request.lang }));
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.json()).toEqual({ lang: 'zh' });
  });
});
