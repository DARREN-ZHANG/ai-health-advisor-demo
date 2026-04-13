import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import path from 'node:path';
import { buildApp } from '../../../app.js';
import type { FastifyInstance } from 'fastify';

const DATA_DIR = path.resolve(process.cwd(), '../../data/sandbox');

describe('God-Mode Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.FALLBACK_ONLY_MODE = 'true';
    process.env.ENABLE_GOD_MODE = 'true';
    process.env.NODE_ENV = 'test';
    process.env.DATA_DIR = DATA_DIR;
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.FALLBACK_ONLY_MODE;
    delete process.env.ENABLE_GOD_MODE;
    delete process.env.NODE_ENV;
    delete process.env.DATA_DIR;
  });

  describe('POST /god-mode/switch-profile', () => {
    test('切换到存在的 profile 返回 200', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/switch-profile',
        payload: { profileId: 'profile-c' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.currentProfileId).toBe('profile-c');

      // 恢复默认 profile
      await app.inject({
        method: 'POST',
        url: '/god-mode/reset',
        payload: { scope: 'all' },
      });
    });

    test('切换到不存在的 profile 返回 404', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/switch-profile',
        payload: { profileId: 'nonexistent' },
      });

      expect(response.statusCode).toBe(404);
    });

    test('无效 payload 返回 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/switch-profile',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /god-mode/inject-event', () => {
    test('注入事件返回 200', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/inject-event',
        payload: {
          eventType: 'late_night_work',
          data: { endTime: '03:00' },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.injectedEvents).toHaveLength(1);
      expect(body.data.injectedEvents[0].type).toBe('late_night_work');
      expect(body.data.injectedEvents[0].data).toEqual({ endTime: '03:00' });
      expect(body.data.activeSensing).toEqual({
        visible: true,
        priority: 'high',
        surface: 'banner',
        date: body.data.injectedEvents[0].date,
        events: ['late_night_work'],
      });
    });

    test('指定 profileId 注入事件', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/inject-event',
        payload: {
          profileId: 'profile-a',
          eventType: 'illness',
          data: { symptoms: ['fever'] },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.injectedEvents[body.data.injectedEvents.length - 1].type).toBe('illness');
    });

    test('无效 payload 返回 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/inject-event',
        payload: { data: {} },
      });

      expect(response.statusCode).toBe(400);
    });

    test('恢复：清除注入的事件', async () => {
      await app.inject({
        method: 'POST',
        url: '/god-mode/reset',
        payload: { scope: 'events' },
      });
    });
  });

  describe('POST /god-mode/override-metric', () => {
    test('覆盖指标返回 200', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/override-metric',
        payload: {
          metric: 'hrv',
          value: 15,
          dateRange: { start: '2026-04-08', end: '2026-04-10' },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.activeOverrides.length).toBeGreaterThanOrEqual(1);
      const lastOverride = body.data.activeOverrides[body.data.activeOverrides.length - 1];
      expect(lastOverride.metric).toBe('hrv');
      expect(lastOverride.value).toBe(15);
    });

    test('无效 payload 返回 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/override-metric',
        payload: { value: 10 },
      });

      expect(response.statusCode).toBe(400);
    });

    test('恢复：清除 overrides', async () => {
      await app.inject({
        method: 'POST',
        url: '/god-mode/reset',
        payload: { scope: 'overrides' },
      });
    });
  });

  describe('POST /god-mode/reset', () => {
    test('重置所有修改返回 200', async () => {
      // 先添加一些修改
      await app.inject({
        method: 'POST',
        url: '/god-mode/override-metric',
        payload: { metric: 'hrv', value: 10 },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/reset',
        payload: { scope: 'all' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.currentProfileId).toBe('profile-a');
      expect(body.data.activeOverrides).toEqual([]);
      expect(body.data.injectedEvents).toEqual([]);
      expect(body.data.activeSensing).toBeNull();
    });

    test('scope=profile 时清空当前 session 的旧 profile 对话记忆', async () => {
      const sessionId = 'sess-reset-profile';
      const headers = { 'x-session-id': sessionId };

      await app.inject({
        method: 'POST',
        url: '/god-mode/switch-profile',
        headers,
        payload: { profileId: 'profile-c' },
      });

      await app.inject({
        method: 'POST',
        url: '/ai/chat',
        headers,
        payload: {
          profileId: 'profile-c',
          pageContext: { profileId: 'profile-c', page: 'home', timeframe: 'week' },
          userMessage: '当前怎么样',
        },
      });

      expect(app.runtime.sessionStore.store.get(sessionId)?.profileId).toBe('profile-c');

      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/reset',
        headers,
        payload: { scope: 'profile' },
      });

      expect(response.statusCode).toBe(200);
      expect(app.runtime.sessionStore.store.get(sessionId)).toBeUndefined();
    });

    test('scope=all 时清空当前 session 的旧 profile 对话记忆', async () => {
      const sessionId = 'sess-reset-all';
      const headers = { 'x-session-id': sessionId };

      await app.inject({
        method: 'POST',
        url: '/god-mode/switch-profile',
        headers,
        payload: { profileId: 'profile-c' },
      });

      await app.inject({
        method: 'POST',
        url: '/ai/chat',
        headers,
        payload: {
          profileId: 'profile-c',
          pageContext: { profileId: 'profile-c', page: 'home', timeframe: 'week' },
          userMessage: '还有哪些风险',
        },
      });

      expect(app.runtime.sessionStore.store.get(sessionId)?.profileId).toBe('profile-c');

      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/reset',
        headers,
        payload: { scope: 'all' },
      });

      expect(response.statusCode).toBe(200);
      expect(app.runtime.sessionStore.store.get(sessionId)).toBeUndefined();
    });

    test('scope=all 在无 session header 时清空全部会话与分析记忆', async () => {
      app.runtime.sessionStore.store.appendMessage('sess-global-a', 'profile-a', {
        role: 'user',
        text: '保留前的会话 A',
        createdAt: Date.now(),
      });
      app.runtime.sessionStore.store.appendMessage('sess-global-b', 'profile-b', {
        role: 'assistant',
        text: '保留前的会话 B',
        createdAt: Date.now(),
      });
      app.runtime.analyticalMemory.setHomepageBrief('sess-global-a', 'profile-a', '摘要 A');
      app.runtime.analyticalMemory.setHomepageBrief('sess-global-b', 'profile-b', '摘要 B');

      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/reset',
        payload: { scope: 'all' },
      });

      expect(response.statusCode).toBe(200);
      expect(app.runtime.sessionStore.store.get('sess-global-a')).toBeUndefined();
      expect(app.runtime.sessionStore.store.get('sess-global-b')).toBeUndefined();
      expect(app.runtime.analyticalMemory.get('sess-global-a')).toBeUndefined();
      expect(app.runtime.analyticalMemory.get('sess-global-b')).toBeUndefined();
    });

    test('无效 scope 返回 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/reset',
        payload: { scope: 'invalid' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /god-mode/state', () => {
    test('返回当前状态', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/god-mode/state',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('currentProfileId');
      expect(Array.isArray(body.data.activeOverrides)).toBe(true);
      expect(Array.isArray(body.data.injectedEvents)).toBe(true);
      expect(Array.isArray(body.data.availableScenarios)).toBe(true);
      expect(body.data.availableScenarios.length).toBeGreaterThan(0);
      expect(body.data.availableScenarios[0]).toHaveProperty('scenarioId');
      expect(body.data).toHaveProperty('activeSensing');
    });
  });

  describe('POST /god-mode/scenario/apply', () => {
    test('执行 profile_switch scenario 返回 200', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/scenario/apply',
        payload: { scenarioId: 'switch-to-stress' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.currentProfileId).toBe('profile-c');

      await app.inject({
        method: 'POST',
        url: '/god-mode/reset',
        payload: { scope: 'all' },
      });
    });

    test('执行 event_inject scenario 返回 active sensing 状态', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/scenario/apply',
        payload: { scenarioId: 'inject-late-night' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.activeSensing?.events).toEqual(['late_night_work']);

      await app.inject({
        method: 'POST',
        url: '/god-mode/reset',
        payload: { scope: 'all' },
      });
    });

    test('demo_script 类型必须走 demo-script API', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/scenario/apply',
        payload: { scenarioId: 'demo-stress-journey' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /god-mode/demo-script/run', () => {
    test('执行 demo-stress-journey 返回 200', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/demo-script/run',
        payload: { scenarioId: 'demo-stress-journey' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.scenarioId).toBe('demo-stress-journey');
      expect(body.data.executedSteps).toHaveLength(3);
      expect(body.data.state.currentProfileId).toBe('profile-c');
      expect(body.data.executedSteps[0].action).toBe('profile_switch');
      expect(body.data.executedSteps[0].status).toBe('success');
      expect(body.data.executedSteps[1].action).toBe('event_inject');
      expect(body.data.executedSteps[2].action).toBe('metric_override');
      expect(body.data.state.activeSensing?.events).toEqual(['late_night_work']);

      // 清理
      await app.inject({
        method: 'POST',
        url: '/god-mode/reset',
        payload: { scope: 'all' },
      });
    });

    test('不存在的 scenario 返回 404', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/demo-script/run',
        payload: { scenarioId: 'nonexistent-scenario' },
      });

      expect(response.statusCode).toBe(404);
    });

    test('无效 payload 返回 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/demo-script/run',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    test('非 demo_script 类型返回 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/demo-script/run',
        payload: { scenarioId: 'switch-to-stress' },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
