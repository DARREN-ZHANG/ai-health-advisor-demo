import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import path from 'node:path';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import type { AgentResponseEnvelope, PageContext } from '@health-advisor/shared';
import { AgentTaskType } from '@health-advisor/shared';

// mock executeAgent 以隔离 AI 路由
vi.mock('@health-advisor/agent-core', async (importOriginal) => {
  const mod = await importOriginal<any>();
  return { ...mod, executeAgent: vi.fn() };
});

import { executeAgent } from '@health-advisor/agent-core';
const mockedExecuteAgent = vi.mocked(executeAgent);

const DATA_DIR = path.resolve(process.cwd(), '../../data/sandbox');

const defaultPageContext: PageContext = {
  profileId: 'profile-a',
  page: 'home',
  timeframe: 'week',
};

const mockAgentResponse: AgentResponseEnvelope = {
  summary: 'test',
  chartTokens: [],
  microTips: [],
  meta: { taskType: AgentTaskType.HOMEPAGE_SUMMARY, pageContext: defaultPageContext, finishReason: 'complete' },
};

/**
 * BE-026 + BE-027: 验证所有 API 端点返回统一的 ApiResponse envelope
 *
 * 每个 success 响应必须包含：
 * - success: true
 * - data: 非空
 * - meta: { timestamp, requestId, durationMs }
 */
describe('API Response Envelope Consistency', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.FALLBACK_ONLY_MODE = 'true';
    process.env.NODE_ENV = 'test';
    process.env.DATA_DIR = DATA_DIR;
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.FALLBACK_ONLY_MODE;
    delete process.env.NODE_ENV;
    delete process.env.DATA_DIR;
  });

  /** 断言 success envelope 结构 */
  function assertSuccessEnvelope(body: any, label: string) {
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.meta).toBeDefined();
    expect(body.meta.timestamp).toBeDefined();
    expect(body.meta.requestId).toBeDefined();
    expect(typeof body.meta.durationMs).toBe('number');
  }

  /** 断言 error envelope 结构 */
  function assertErrorEnvelope(body: any, label: string) {
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.meta).toBeDefined();
  }

  describe('Health Routes', () => {
    test('GET /health 返回统一 envelope', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
      assertSuccessEnvelope(response.json(), 'health');
    });
  });

  describe('Profile Routes', () => {
    test('GET /profiles 返回统一 envelope', async () => {
      const response = await app.inject({ method: 'GET', url: '/profiles' });
      expect(response.statusCode).toBe(200);
      assertSuccessEnvelope(response.json(), 'profiles list');
    });

    test('GET /profiles/:profileId 返回统一 envelope', async () => {
      const response = await app.inject({ method: 'GET', url: '/profiles/profile-a' });
      expect(response.statusCode).toBe(200);
      assertSuccessEnvelope(response.json(), 'profile detail');
    });

    test('GET /profiles/:nonexistent 返回 error envelope', async () => {
      const response = await app.inject({ method: 'GET', url: '/profiles/nonexistent' });
      expect(response.statusCode).toBe(404);
      assertErrorEnvelope(response.json(), 'profile 404');
    });
  });

  describe('Data Routes', () => {
    test('GET /profiles/:profileId/timeline 返回统一 envelope', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/profiles/profile-a/timeline?timeframe=week',
      });
      expect(response.statusCode).toBe(200);
      assertSuccessEnvelope(response.json(), 'timeline');
    });

    test('GET /profiles/:profileId/data 返回统一 envelope', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/profiles/profile-a/data?tab=hrv&timeframe=week',
      });
      expect(response.statusCode).toBe(200);
      assertSuccessEnvelope(response.json(), 'data-center');
    });

    test('GET /profiles/:profileId/chart-data 返回统一 envelope', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/profiles/profile-a/chart-data?tokens=HRV_7DAYS&timeframe=week',
      });
      expect(response.statusCode).toBe(200);
      assertSuccessEnvelope(response.json(), 'chart-data');
    });

    test('无效 timeframe 返回 error envelope', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/profiles/profile-a/timeline?timeframe=invalid',
      });
      expect(response.statusCode).toBe(400);
      assertErrorEnvelope(response.json(), 'timeline 400');
    });
  });

  describe('AI Routes', () => {
    test('POST /ai/morning-brief 返回统一 envelope', async () => {
      mockedExecuteAgent.mockResolvedValueOnce(mockAgentResponse);
      const response = await app.inject({
        method: 'POST',
        url: '/ai/morning-brief',
        payload: { profileId: 'profile-a', pageContext: defaultPageContext },
        headers: { 'x-session-id': 'sess-test' },
      });
      expect(response.statusCode).toBe(200);
      assertSuccessEnvelope(response.json(), 'morning-brief');
    });

    test('POST /ai/chat 返回统一 envelope', async () => {
      mockedExecuteAgent.mockResolvedValueOnce(mockAgentResponse);
      const response = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        payload: { profileId: 'profile-a', pageContext: defaultPageContext, userMessage: 'hello' },
        headers: { 'x-session-id': 'sess-test' },
      });
      expect(response.statusCode).toBe(200);
      assertSuccessEnvelope(response.json(), 'chat');
    });

    test('无效 pageContext 返回 error envelope', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/morning-brief',
        payload: { profileId: 'profile-a', pageContext: { invalid: true } },
      });
      expect(response.statusCode).toBe(400);
      assertErrorEnvelope(response.json(), 'ai 400');
    });
  });

  describe('God-Mode Routes', () => {
    test('POST /god-mode/switch-profile 返回统一 envelope', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/switch-profile',
        payload: { profileId: 'profile-c' },
      });
      expect(response.statusCode).toBe(200);
      assertSuccessEnvelope(response.json(), 'switch-profile');

      // 恢复
      await app.inject({
        method: 'POST',
        url: '/god-mode/reset',
        payload: { scope: 'all' },
      });
    });

    test('GET /god-mode/state 返回统一 envelope', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/god-mode/state',
      });
      expect(response.statusCode).toBe(200);
      assertSuccessEnvelope(response.json(), 'god-mode state');
    });

    test('POST /god-mode/inject-event 返回统一 envelope', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/inject-event',
        payload: { eventType: 'test', data: {} },
      });
      expect(response.statusCode).toBe(200);
      assertSuccessEnvelope(response.json(), 'inject-event');

      // 恢复
      await app.inject({
        method: 'POST',
        url: '/god-mode/reset',
        payload: { scope: 'events' },
      });
    });

    test('POST /god-mode/override-metric 返回统一 envelope', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/override-metric',
        payload: { metric: 'hrv', value: 10 },
      });
      expect(response.statusCode).toBe(200);
      assertSuccessEnvelope(response.json(), 'override-metric');

      // 恢复
      await app.inject({
        method: 'POST',
        url: '/god-mode/reset',
        payload: { scope: 'overrides' },
      });
    });

    test('POST /god-mode/reset 返回统一 envelope', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/reset',
        payload: { scope: 'all' },
      });
      expect(response.statusCode).toBe(200);
      assertSuccessEnvelope(response.json(), 'reset');
    });

    test('POST /god-mode/demo-script/run 返回统一 envelope', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/demo-script/run',
        payload: { scenarioId: 'demo-stress-journey' },
      });
      expect(response.statusCode).toBe(200);
      assertSuccessEnvelope(response.json(), 'demo-script');

      // 恢复
      await app.inject({
        method: 'POST',
        url: '/god-mode/reset',
        payload: { scope: 'all' },
      });
    });

    test('不存在的 profile 返回 error envelope', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/switch-profile',
        payload: { profileId: 'nonexistent' },
      });
      expect(response.statusCode).toBe(404);
      assertErrorEnvelope(response.json(), 'switch-profile 404');
    });
  });
});
