import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import path from 'node:path';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import type { AgentResponseEnvelope, PageContext } from '@health-advisor/shared';
import { AgentTaskType } from '@health-advisor/shared';

// mock executeAgent 以隔离 AI 路由
vi.mock('@health-advisor/agent-core', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  source: 'llm',
  statusColor: 'good',
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

  /** 断言 success envelope 结构 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function assertSuccessEnvelope(body: any) {
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.meta).toBeDefined();
    expect(body.meta.timestamp).toBeDefined();
    expect(body.meta.requestId).toBeDefined();
    expect(typeof body.meta.durationMs).toBe('number');
  }

  /** 断言 error envelope 结构 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function assertErrorEnvelope(body: any) {
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.meta).toBeDefined();
  }

  describe('Health Routes', () => {
    test('GET /health 返回统一 envelope', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
      assertSuccessEnvelope(response.json());
    });
  });

  describe('Profile Routes', () => {
    test('GET /profiles 返回统一 envelope', async () => {
      const response = await app.inject({ method: 'GET', url: '/profiles' });
      expect(response.statusCode).toBe(200);
      assertSuccessEnvelope(response.json());
    });

    test('GET /profiles/:profileId 返回统一 envelope', async () => {
      const response = await app.inject({ method: 'GET', url: '/profiles/profile-a' });
      expect(response.statusCode).toBe(200);
      assertSuccessEnvelope(response.json());
    });

    test('GET /profiles/:nonexistent 返回 error envelope', async () => {
      const response = await app.inject({ method: 'GET', url: '/profiles/nonexistent' });
      expect(response.statusCode).toBe(404);
      assertErrorEnvelope(response.json());
    });
  });

  describe('Data Routes', () => {
    test('GET /profiles/:profileId/timeline 返回统一 envelope', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/profiles/profile-a/timeline?timeframe=week',
      });
      expect(response.statusCode).toBe(200);
      assertSuccessEnvelope(response.json());
    });

    test('GET /profiles/:profileId/data 返回统一 envelope', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/profiles/profile-a/data?tab=hrv&timeframe=week',
      });
      expect(response.statusCode).toBe(200);
      assertSuccessEnvelope(response.json());
    });

    test('GET /profiles/:profileId/chart-data 返回统一 envelope', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/profiles/profile-a/chart-data?tokens=HRV_7DAYS&timeframe=week',
      });
      expect(response.statusCode).toBe(200);
      assertSuccessEnvelope(response.json());
    });

    test('无效 timeframe 返回 error envelope', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/profiles/profile-a/timeline?timeframe=invalid',
      });
      expect(response.statusCode).toBe(400);
      assertErrorEnvelope(response.json());
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
      assertSuccessEnvelope(response.json());
      expect(response.headers['x-session-id']).toBe('sess-test');
      expect(response.json().data.meta.sessionId).toBe('sess-test');
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
      assertSuccessEnvelope(response.json());
      expect(response.headers['x-session-id']).toBe('sess-test');
      expect(response.json().data.meta.sessionId).toBe('sess-test');
    });

    test('AI 路由在缺少 session header 时也会回写统一 sessionId', async () => {
      mockedExecuteAgent.mockResolvedValueOnce(mockAgentResponse);
      const response = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        payload: { profileId: 'profile-a', pageContext: defaultPageContext, userMessage: 'hello' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      assertSuccessEnvelope(body);
      expect(typeof body.data.meta.sessionId).toBe('string');
      expect(response.headers['x-session-id']).toBe(body.data.meta.sessionId);
    });

    test('无效 pageContext 返回 error envelope', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/morning-brief',
        payload: { profileId: 'profile-a', pageContext: { invalid: true } },
      });
      expect(response.statusCode).toBe(400);
      assertErrorEnvelope(response.json());
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
      assertSuccessEnvelope(response.json());

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
      assertSuccessEnvelope(response.json());
    });

    test('POST /god-mode/inject-event 返回统一 envelope', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/inject-event',
        payload: { eventType: 'test', data: {} },
      });
      expect(response.statusCode).toBe(200);
      assertSuccessEnvelope(response.json());

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
      assertSuccessEnvelope(response.json());

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
      assertSuccessEnvelope(response.json());
    });

    test('不存在的 profile 返回 error envelope', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/switch-profile',
        payload: { profileId: 'nonexistent' },
      });
      expect(response.statusCode).toBe(404);
      assertErrorEnvelope(response.json());
    });
  });
});
