import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import path from 'node:path';
import { buildApp } from '../../../app.js';
import type { FastifyInstance } from 'fastify';
import type { AgentResponseEnvelope, PageContext } from '@health-advisor/shared';
import { AgentTaskType } from '@health-advisor/shared';

// mock executeAgent
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

const mockResponse: AgentResponseEnvelope = {
  summary: '健康状态良好',
  chartTokens: [],
  microTips: ['保持运动'],
  meta: { taskType: AgentTaskType.HOMEPAGE_SUMMARY, pageContext: defaultPageContext, finishReason: 'complete' },
};

describe('AI Routes', () => {
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

  describe('POST /ai/morning-brief', () => {
    test('返回 AI 结构化响应', async () => {
      mockedExecuteAgent.mockResolvedValueOnce(mockResponse);

      const response = await app.inject({
        method: 'POST',
        url: '/ai/morning-brief',
        payload: {
          profileId: 'profile-a',
          pageContext: defaultPageContext,
        },
        headers: { 'x-session-id': 'sess-1' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.summary).toBe('健康状态良好');
    });

    test('无效 pageContext 返回 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/morning-brief',
        payload: {
          profileId: 'profile-a',
          pageContext: { invalid: true },
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /ai/view-summary', () => {
    test('返回视图总结响应', async () => {
      const viewResponse: AgentResponseEnvelope = {
        ...mockResponse,
        meta: { ...mockResponse.meta, taskType: AgentTaskType.VIEW_SUMMARY },
      };
      mockedExecuteAgent.mockResolvedValueOnce(viewResponse);

      const response = await app.inject({
        method: 'POST',
        url: '/ai/view-summary',
        payload: {
          profileId: 'profile-a',
          pageContext: { profileId: 'profile-a', page: 'data-center', timeframe: 'week', dataTab: 'hrv' },
          tab: 'hrv',
          timeframe: 'week',
        },
        headers: { 'x-session-id': 'sess-1' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
    });
  });

  describe('POST /ai/chat', () => {
    test('返回聊天响应', async () => {
      const chatResponse: AgentResponseEnvelope = {
        ...mockResponse,
        summary: '你的 HRV 趋势稳定',
        meta: { ...mockResponse.meta, taskType: AgentTaskType.ADVISOR_CHAT },
      };
      mockedExecuteAgent.mockResolvedValueOnce(chatResponse);

      const response = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        payload: {
          profileId: 'profile-a',
          pageContext: defaultPageContext,
          userMessage: '最近感觉怎样',
        },
        headers: { 'x-session-id': 'sess-1' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.summary).toBe('你的 HRV 趋势稳定');
    });

    test('缺少 userMessage 返回 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        payload: {
          profileId: 'profile-a',
          pageContext: defaultPageContext,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
