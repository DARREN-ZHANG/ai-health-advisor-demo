import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import path from 'node:path';
import { buildApp } from '../../../app.js';
import type { FastifyInstance } from 'fastify';
import type { AgentResponseEnvelope, PageContext } from '@health-advisor/shared';
import { AgentTaskType } from '@health-advisor/shared';

// mock executeAgent
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

const mockResponse: AgentResponseEnvelope = {
  summary: '健康状态良好',
  source: 'llm',
  statusColor: 'good',
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
      expect(body.data.meta.sessionId).toBe('sess-1');
      expect(response.headers['x-session-id']).toBe('sess-1');
    });

    test('有 pending 事件时隐式触发 app_open 同步', async () => {
      // 清理前序测试残留的 mock 和缓存
      mockedExecuteAgent.mockReset();
      mockedExecuteAgent.mockResolvedValueOnce(mockResponse);

      // 先注入一个活动片段产生 pending 事件
      app.runtime.overrideStore.appendSegment('profile-a', 'sleep', { duration: 480 });
      const pendingBefore = app.runtime.overrideStore.getPendingEvents('profile-a');
      expect(pendingBefore.length).toBeGreaterThan(0);

      const response = await app.inject({
        method: 'POST',
        url: '/ai/morning-brief',
        payload: {
          profileId: 'profile-a',
          pageContext: defaultPageContext,
          bustCache: true,
        },
        headers: { 'x-session-id': 'sess-sync' },
      });

      expect(response.statusCode).toBe(200);

      // 同步后 pending 事件应被清空（变为已同步）
      const pendingAfter = app.runtime.overrideStore.getPendingEvents('profile-a');
      expect(pendingAfter.length).toBe(0);

      // 同步会话中应有 app_open 记录
      const syncState = app.runtime.overrideStore.getSyncState('profile-a');
      const appOpenSessions = syncState.syncSessions.filter(s => s.trigger === 'app_open');
      expect(appOpenSessions.length).toBeGreaterThan(0);
    });

    test('无 pending 事件时不触发同步', async () => {
      // 清理前序测试残留的 mock 和缓存
      mockedExecuteAgent.mockReset();
      mockedExecuteAgent.mockResolvedValueOnce(mockResponse);

      // 先执行一次同步清空 pending
      app.runtime.overrideStore.performSync('profile-a', 'manual_refresh');

      const syncStateBefore = app.runtime.overrideStore.getSyncState('profile-a');
      const sessionCountBefore = syncStateBefore.syncSessions.length;

      const response = await app.inject({
        method: 'POST',
        url: '/ai/morning-brief',
        payload: {
          profileId: 'profile-a',
          pageContext: defaultPageContext,
          bustCache: true,
        },
      });

      expect(response.statusCode).toBe(200);

      // 无 pending 事件时同步会话数量不变
      const syncStateAfter = app.runtime.overrideStore.getSyncState('profile-a');
      expect(syncStateAfter.syncSessions.length).toBe(sessionCountBefore);
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
      expect(body.data.meta.sessionId).toBe('sess-1');
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
      expect(body.data.meta.sessionId).toBe('sess-1');
    });

    test('无 session header 时自动回写后端签发的 sessionId', async () => {
      mockedExecuteAgent.mockResolvedValueOnce(chatResponse());

      const response = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        payload: {
          profileId: 'profile-a',
          pageContext: defaultPageContext,
          userMessage: '最近感觉怎样',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(typeof body.data.meta.sessionId).toBe('string');
      expect(response.headers['x-session-id']).toBe(body.data.meta.sessionId);
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

function chatResponse(): AgentResponseEnvelope {
  return {
    ...mockResponse,
    summary: '你的 HRV 趋势稳定',
    meta: { ...mockResponse.meta, taskType: AgentTaskType.ADVISOR_CHAT },
  };
}
