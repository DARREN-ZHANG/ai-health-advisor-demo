import { afterAll, beforeAll, describe, expect, it, test, vi } from 'vitest';
import path from 'node:path';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { buildApp } from '../../../app.js';
import type { FastifyInstance } from 'fastify';
import type { AgentResponseEnvelope, PageContext } from '@health-advisor/shared';
import { AgentTaskType, ErrorCode } from '@health-advisor/shared';

// mock executeAgent
vi.mock('@health-advisor/agent-core', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = await importOriginal<any>();
  return { ...mod, executeAgent: vi.fn() };
});

import { executeAgent } from '@health-advisor/agent-core';
const mockedExecuteAgent = vi.mocked(executeAgent);

const SOURCE_DATA_DIR = path.resolve(process.cwd(), '../../data/sandbox');

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
  meta: {
    taskType: AgentTaskType.HOMEPAGE_SUMMARY,
    pageContext: defaultPageContext,
    finishReason: 'complete',
  },
};

describe('AI Routes', () => {
  let app: FastifyInstance;
  let dataDir: string;

  beforeAll(async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'health-advisor-ai-routes-'));
    cpSync(SOURCE_DATA_DIR, dataDir, { recursive: true });

    app = await buildApp({
      env: {
        FALLBACK_ONLY_MODE: 'true',
        ENABLE_GOD_MODE: 'true',
        NODE_ENV: 'test',
        DATA_DIR: dataDir,
      },
    });
  });

  afterAll(async () => {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
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

      // 重置时间轴，使 baseline 的 rawEvents 重新变为 pending 状态
      const overrideStore = app.runtime.getSessionSandbox('sess-sync').overrideStore;
      overrideStore.resetProfileTimeline('profile-a');
      const pendingBefore = overrideStore.getPendingEvents('profile-a');
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
      const pendingAfter = overrideStore.getPendingEvents('profile-a');
      expect(pendingAfter.length).toBe(0);

      // 同步会话中应有 app_open 记录
      const syncState = overrideStore.getSyncState('profile-a');
      const appOpenSessions = syncState.syncSessions.filter((s) => s.trigger === 'app_open');
      expect(appOpenSessions.length).toBeGreaterThan(0);
    });

    test('无 pending 事件时不触发同步', async () => {
      // 清理前序测试残留的 mock 和缓存
      mockedExecuteAgent.mockReset();
      mockedExecuteAgent.mockResolvedValueOnce(mockResponse);

      // 先执行一次同步清空 pending
      const sessionId = 'sess-no-pending';
      const overrideStore = app.runtime.getSessionSandbox(sessionId).overrideStore;
      overrideStore.performSync('profile-a', 'manual_refresh');

      const syncStateBefore = overrideStore.getSyncState('profile-a');
      const sessionCountBefore = syncStateBefore.syncSessions.length;

      const response = await app.inject({
        method: 'POST',
        url: '/ai/morning-brief',
        payload: {
          profileId: 'profile-a',
          pageContext: defaultPageContext,
          bustCache: true,
        },
        headers: { 'x-session-id': sessionId },
      });

      expect(response.statusCode).toBe(200);

      // 无 pending 事件时同步会话数量不变
      const syncStateAfter = overrideStore.getSyncState('profile-a');
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

    test('GOD MODE 校准后不再返回旧的 morning brief 缓存', async () => {
      mockedExecuteAgent.mockReset();
      app.briefCache.clearAll();
      const sessionId = 'sess-recalibrate';
      app.runtime.getSessionSandbox(sessionId).overrideStore.reset('all');

      const staleResponse: AgentResponseEnvelope = {
        ...mockResponse,
        summary: 'HRV 数据缺失',
      };
      const freshResponse: AgentResponseEnvelope = {
        ...mockResponse,
        summary: 'HRV 数据已恢复',
      };

      mockedExecuteAgent.mockResolvedValueOnce(staleResponse).mockResolvedValueOnce(freshResponse);

      const first = await app.inject({
        method: 'POST',
        url: '/ai/morning-brief',
        payload: {
          profileId: 'profile-a',
          pageContext: defaultPageContext,
        },
        headers: { 'x-session-id': sessionId },
      });

      expect(first.statusCode).toBe(200);
      expect(first.json().data.summary).toBe('HRV 数据缺失');

      const recalibrate = await app.inject({
        method: 'POST',
        url: '/god-mode/recalibrate',
        payload: {},
        headers: { 'x-session-id': sessionId },
      });

      expect(recalibrate.statusCode).toBe(200);

      const second = await app.inject({
        method: 'POST',
        url: '/ai/morning-brief',
        payload: {
          profileId: 'profile-a',
          pageContext: defaultPageContext,
        },
        headers: { 'x-session-id': sessionId },
      });

      expect(second.statusCode).toBe(200);
      expect(second.json().data.summary).toBe('HRV 数据已恢复');
      expect(mockedExecuteAgent).toHaveBeenCalledTimes(2);
    });

    test('micro event append can be followed by bust-cache morning brief regeneration', async () => {
      mockedExecuteAgent.mockReset();
      mockedExecuteAgent.mockResolvedValueOnce(mockResponse);
      const sessionId = 'sess-micro-event';
      app.runtime.getSessionSandbox(sessionId).overrideStore.reset('all');

      const appendResponse = await app.inject({
        method: 'POST',
        url: '/god-mode/micro-event-append',
        payload: { microEventType: 'micro_deep_breathing', durationMinutes: 3 },
        headers: { 'x-session-id': sessionId },
      });

      expect(appendResponse.statusCode).toBe(200);
      expect(
        appendResponse
          .json()
          .data.recentRecognizedEvents.some(
            (event: { type: string }) => event.type === 'micro_deep_breathing',
          ),
      ).toBe(true);

      const briefResponse = await app.inject({
        method: 'POST',
        url: '/ai/morning-brief',
        payload: {
          profileId: 'profile-a',
          pageContext: defaultPageContext,
          bustCache: true,
        },
        headers: { 'x-session-id': sessionId },
      });

      expect(briefResponse.statusCode).toBe(200);
      const body = briefResponse.json();
      expect(body.success).toBe(true);
      expect(body.data.summary).toEqual(expect.any(String));
      expect(Array.isArray(body.data.chartTokens)).toBe(true);
    });
  });

  describe('POST /ai/morning-brief/stream', () => {
    /**
     * 解析 SSE 文本为事件数组。每个事件是 { event, data }。
     * SSE 帧格式：`event: <type>\ndata: <json>\n\n`
     */
    function parseSseFrames(text: string): Array<{ event: string; data: unknown }> {
      const frames: Array<{ event: string; data: unknown }> = [];
      const blocks = text.split('\n\n');
      for (const block of blocks) {
        if (!block.trim()) continue;
        let eventType = '';
        let dataLine = '';
        for (const line of block.split('\n')) {
          if (line.startsWith('event: ')) eventType = line.slice(7);
          else if (line.startsWith('data: ')) dataLine = line.slice(6);
        }
        if (eventType && dataLine) {
          frames.push({ event: eventType, data: JSON.parse(dataLine) });
        }
      }
      return frames;
    }

    test('cache miss 多 delta：started → delta* → completed', async () => {
      mockedExecuteAgent.mockReset();
      app.briefCache.clearAll();
      app.runtime.getSessionSandbox('sess-stream-1').overrideStore.reset('all');

      // executeAgent 收到 options.onSummaryDelta，调用模拟 delta
      mockedExecuteAgent.mockImplementationOnce(
        async (_req, _deps, _timeout, _observer, _locale, options) => {
          const onDelta = options?.onSummaryDelta;
          if (onDelta) {
            await onDelta('健康');
            await onDelta('状态');
            await onDelta('良好');
          }
          return mockResponse;
        },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/ai/morning-brief/stream',
        payload: {
          profileId: 'profile-a',
          pageContext: defaultPageContext,
          bustCache: true,
        },
        headers: { 'x-session-id': 'sess-stream-1' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache, no-transform');
      expect(response.headers['x-accel-buffering']).toBe('no');
      expect(response.headers['x-session-id']).toBe('sess-stream-1');

      const frames = parseSseFrames(response.body);
      const types = frames.map((f) => f.event);
      expect(types[0]).toBe('brief.started');
      // 中间 3 个都是 delta
      expect(types.slice(1, 4)).toEqual([
        'brief.summary.delta',
        'brief.summary.delta',
        'brief.summary.delta',
      ]);
      // 最后一个是 completed
      expect(types[types.length - 1]).toBe('brief.completed');

      // delta 内容顺序
      const deltas = frames
        .filter((f) => f.event === 'brief.summary.delta')
        .map((f) => (f.data as { delta: string }).delta);
      expect(deltas).toEqual(['健康', '状态', '良好']);

      // completed 事件含完整 response
      const completed = frames.find((f) => f.event === 'brief.completed');
      expect(completed).toBeDefined();
      expect((completed!.data as { response: { summary: string } }).response.summary).toBe('健康状态良好');

      // 只有一个终态
      const terminals = frames.filter((f) => f.event === 'brief.completed' || f.event === 'brief.failed');
      expect(terminals).toHaveLength(1);
    });

    test('cache hit 直达 completed（无 delta）', async () => {
      mockedExecuteAgent.mockReset();
      app.runtime.getSessionSandbox('sess-stream-2').overrideStore.reset('all');

      // 第一次调用产生缓存
      mockedExecuteAgent.mockResolvedValueOnce(mockResponse);
      await app.inject({
        method: 'POST',
        url: '/ai/morning-brief',
        payload: { profileId: 'profile-a', pageContext: defaultPageContext },
        headers: { 'x-session-id': 'sess-stream-2' },
      });

      // 第二次 stream 调用应命中缓存，不调用 executeAgent
      mockedExecuteAgent.mockClear();

      const response = await app.inject({
        method: 'POST',
        url: '/ai/morning-brief/stream',
        payload: { profileId: 'profile-a', pageContext: defaultPageContext },
        headers: { 'x-session-id': 'sess-stream-2' },
      });

      expect(response.statusCode).toBe(200);
      const frames = parseSseFrames(response.body);
      const types = frames.map((f) => f.event);

      // 只有 started + completed，无 delta
      expect(types).toEqual(['brief.started', 'brief.completed']);
      expect(types).not.toContain('brief.summary.delta');
      expect(mockedExecuteAgent).not.toHaveBeenCalled();

      // completed 的 finishReason 保留 cached
      const completed = frames.find((f) => f.event === 'brief.completed');
      expect(
        (completed!.data as { response: { meta: { finishReason: string } } }).response.meta.finishReason,
      ).toBe('cached');
    });

    test('invalid output（fallback）发 failed terminal', async () => {
      mockedExecuteAgent.mockReset();
      app.briefCache.clearAll();
      app.runtime.getSessionSandbox('sess-stream-3').overrideStore.reset('all');

      const fallbackResponse: AgentResponseEnvelope = {
        ...mockResponse,
        source: 'fallback',
        statusColor: 'warning',
        meta: { ...mockResponse.meta, finishReason: 'fallback' },
      };
      mockedExecuteAgent.mockResolvedValueOnce(fallbackResponse);

      const response = await app.inject({
        method: 'POST',
        url: '/ai/morning-brief/stream',
        payload: {
          profileId: 'profile-a',
          pageContext: defaultPageContext,
          bustCache: true,
        },
        headers: { 'x-session-id': 'sess-stream-3' },
      });

      expect(response.statusCode).toBe(200);
      const frames = parseSseFrames(response.body);
      const types = frames.map((f) => f.event);

      // started → failed（无 completed）
      expect(types[0]).toBe('brief.started');
      expect(types[types.length - 1]).toBe('brief.failed');
      expect(types).not.toContain('brief.completed');

      // failed 含错误码
      const failed = frames.find((f) => f.event === 'brief.failed');
      expect((failed!.data as { error: { code: string } }).error.code).toBe('BRIEF_GENERATION_FAILED');
    });

    test('provider exception 发 failed terminal', async () => {
      mockedExecuteAgent.mockReset();
      app.briefCache.clearAll();
      app.runtime.getSessionSandbox('sess-stream-4').overrideStore.reset('all');

      mockedExecuteAgent.mockRejectedValueOnce(new Error('connection failed'));

      const response = await app.inject({
        method: 'POST',
        url: '/ai/morning-brief/stream',
        payload: {
          profileId: 'profile-a',
          pageContext: defaultPageContext,
          bustCache: true,
        },
        headers: { 'x-session-id': 'sess-stream-4' },
      });

      expect(response.statusCode).toBe(200);
      const frames = parseSseFrames(response.body);
      const types = frames.map((f) => f.event);

      // started → failed
      expect(types[0]).toBe('brief.started');
      expect(types[types.length - 1]).toBe('brief.failed');
      expect(types).not.toContain('brief.completed');
    });

    test('无效 pageContext 返回 400 JSON（不是 SSE）', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/morning-brief/stream',
        payload: {
          profileId: 'profile-a',
          pageContext: { invalid: true },
        },
      });

      expect(response.statusCode).toBe(400);
      // 仍是 JSON error，不是 SSE
      expect(response.headers['content-type']).toContain('application/json');
      const body = response.json();
      expect(body.success).toBe(false);
    });

    /**
     * 覆盖 routes.ts 的 onDisconnect → abortController.abort() 链路。
     *
     * routes.ts 注册了 request.raw.on('aborted', onDisconnect) 和
     * reply.raw.on('close', onDisconnect)。其余 5 个 stream 测试都用
     * app.inject 正常完成，从不触发断连路径。
     *
     * inject 模式下 request.raw 是 light-my-request 的 Request（继承自
     * Readable + EventEmitter），支持手动 emit。本测试通过 preHandler
     * 捕获 request.raw，在 mock executeAgent 的第一次 onSummaryDelta 之后
     * emit 'aborted'，验证：
     *   1. onDisconnect 被触发并调用 abortController.abort()
     *      （证据：options.signal.aborted === true）
     *   2. SSE 流仍以合法终端结束（exactly-one-terminal 不变）
     *
     * 真实场景下 abort 后底层 provider 会抛 AbortError，routes 走 catch
     * 发 failed；这里 mock executeAgent 不监听 signal，直接返回
     * mockResponse，因此走 completed 终态——验证的是 abort 链路注册正确，
     * 不验证 provider 取消语义（由 agent-core 单测覆盖）。
     *
     * 独立 app 实例避免 preHandler hook 污染全局 app 的其他测试。
     */
    test('客户端断连触发 abortController.abort()（onDisconnect 链路）', async () => {
      const localApp = await buildApp({
        env: {
          FALLBACK_ONLY_MODE: 'true',
          ENABLE_GOD_MODE: 'true',
          NODE_ENV: 'test',
          DATA_DIR: dataDir,
        },
      });

      // 捕获 stream 路由的 request.raw，供 mock 在 delta 之间 emit 'aborted'
      let capturedRaw: NodeJS.EventEmitter | undefined;
      localApp.addHook('preHandler', async (request) => {
        if (request.url.includes('/ai/morning-brief/stream')) {
          capturedRaw = request.raw as unknown as NodeJS.EventEmitter;
        }
      });

      mockedExecuteAgent.mockReset();
      localApp.briefCache.clearAll();
      localApp.runtime.getSessionSandbox('sess-stream-abort').overrideStore.reset('all');

      let signalAfterAbort: boolean | undefined;
      let deltaCountAfterAbort = 0;
      mockedExecuteAgent.mockImplementationOnce(
        async (_req, _deps, _timeout, _observer, _locale, options) => {
          const onDelta = options?.onSummaryDelta;
          const signal = options?.signal;
          if (onDelta) {
            await onDelta('健康');
            // 模拟客户端断连：触发 request.raw 的 'aborted' 事件。
            // EventEmitter.emit 是同步的，onDisconnect 立即调用
            // abortController.abort()，signal.aborted 立即变 true。
            capturedRaw?.emit('aborted');
            signalAfterAbort = signal?.aborted;
            // 第二次 delta：真实 provider 此时已收到 abort 会抛
            // AbortError；mock 不监听 signal，继续推送以验证 writer
            // 守卫不会因 abort 误关闭（isClosed 仍为 false，delta 写入）。
            await onDelta('状态');
            deltaCountAfterAbort++;
          }
          return mockResponse;
        },
      );

      const response = await localApp.inject({
        method: 'POST',
        url: '/ai/morning-brief/stream',
        payload: {
          profileId: 'profile-a',
          pageContext: defaultPageContext,
          bustCache: true,
        },
        headers: { 'x-session-id': 'sess-stream-abort' },
      });

      // 断言 1：emit('aborted') 后 onDisconnect 调用了 abortController.abort()
      expect(signalAfterAbort).toBe(true);
      // mock 在 emit 后继续推送了一次 delta
      expect(deltaCountAfterAbort).toBe(1);

      expect(response.statusCode).toBe(200);
      const frames = parseSseFrames(response.body);
      const types = frames.map((f) => f.event);

      // 断言 2：SSE 流仍以合法终端结束（started → delta* → completed）
      expect(types[0]).toBe('brief.started');
      expect(types[types.length - 1]).toBe('brief.completed');
      // 只有一个终态
      const terminals = frames.filter(
        (f) => f.event === 'brief.completed' || f.event === 'brief.failed',
      );
      expect(terminals).toHaveLength(1);

      await localApp.close();
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
          pageContext: {
            profileId: 'profile-a',
            page: 'data-center',
            timeframe: 'week',
            dataTab: 'hrv',
          },
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

    it('returns memory candidate confirmations for advisor chat', async () => {
      const app = await buildApp({
        env: {
          FALLBACK_ONLY_MODE: 'true',
          ENABLE_GOD_MODE: 'false',
          MEMORY_BACKEND: 'memory',
        },
      });

      app.memoryServices.extractor = {
        async extract() {
          return {
            candidates: [
              {
                kind: 'allergy',
                canonicalKey: 'allergy:peanut',
                payload: { allergen: 'peanut' },
                evidenceQuote: '我对花生过敏',
                source: 'user_declared',
                confidence: 'explicit',
                proposedConfirmationText: '是否记住：你对花生过敏？',
                requiresConfirmation: true,
              },
            ],
            rejectedCount: 0,
          };
        },
      };

      mockedExecuteAgent.mockResolvedValueOnce(chatResponse());

      const response = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        headers: { 'x-session-id': 'sess-1' },
        payload: {
          profileId: 'profile-a',
          pageContext: { profileId: 'profile-a', page: 'homepage', timeframe: 'week' },
          userMessage: '我对花生过敏',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.memoryCandidates).toHaveLength(1);
      expect(body.data.memoryCandidates[0].proposedConfirmationText).toContain('花生');

      await app.close();
    });

    it('响应含 uiDirectives 时跳过 memory extractor（UI 控制意图不应被抽为记忆）', async () => {
      // 回归：用户说"我想在首页看Sleep"时，Planner 产出 uiDirectives，
      // 这种瞬时界面操作不应触发记忆抽取，避免误生成"是否将首页显示内容设置为 Sleep?"候选卡。
      const app = await buildApp({
        env: {
          FALLBACK_ONLY_MODE: 'true',
          ENABLE_GOD_MODE: 'false',
          MEMORY_BACKEND: 'memory',
        },
      });

      const extract = vi.fn(async () => ({ candidates: [], rejectedCount: 0 }));
      app.memoryServices.extractor = { extract };

      // 构造携带 uiDirectives 的响应（模拟纯 UI 控制计划）
      mockedExecuteAgent.mockResolvedValueOnce({
        ...chatResponse(),
        summary: '已在首页展示睡眠趋势简报。',
        source: 'planner',
        uiDirectives: [{ type: 'homepage.trend-card.set', display: 'sleep' }],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        headers: { 'x-session-id': 'sess-ui-1' },
        payload: {
          profileId: 'profile-a',
          pageContext: { profileId: 'profile-a', page: 'advisor', timeframe: 'week' },
          userMessage: '我想在首页看Sleep',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      // 主响应正常返回，UI 指令透传
      expect(body.data.uiDirectives).toEqual([
        { type: 'homepage.trend-card.set', display: 'sleep' },
      ]);
      // extractor 被短路，从未调用
      expect(extract).not.toHaveBeenCalled();
      // 不应出现记忆候选卡
      expect(body.data.memoryCandidates).toBeUndefined();

      await app.close();
    });

    it('响应含 planDraftPreview 时跳过 memory extractor（计划操作不应重复成为长期目标）', async () => {
      const app = await buildApp({
        env: {
          FALLBACK_ONLY_MODE: 'true',
          ENABLE_GOD_MODE: 'false',
          MEMORY_BACKEND: 'memory',
        },
      });

      const extract = vi.fn(async () => ({
        candidates: [
          {
            kind: 'goal',
            canonicalKey: 'goal:improve-sleep-in-seven-days',
            payload: { goal: '在7天内改善睡眠浅和白天疲惫' },
            evidenceQuote: '生成一个可执行的7天睡眠恢复计划',
            source: 'user_declared' as const,
            confidence: 'explicit' as const,
            proposedConfirmationText: '是否记录您的目标：在7天内改善睡眠浅和白天疲惫？',
            requiresConfirmation: true,
          },
        ],
        rejectedCount: 0,
      }));
      app.memoryServices.extractor = { extract };

      mockedExecuteAgent.mockResolvedValueOnce({
        ...chatResponse(),
        planDraftPreview: {
          title: '7天睡眠恢复计划',
          summary: '通过一致的作息改善睡眠体验。',
          groups: [
            {
              title: '第 1 天',
              tasks: [{ title: '固定起床时间', estimatedMinutes: 5 }],
            },
          ],
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        headers: { 'x-session-id': 'sess-plan-memory-1' },
        payload: {
          profileId: 'profile-a',
          pageContext: { profileId: 'profile-a', page: 'advisor', timeframe: 'week' },
          userMessage: '请为睡眠浅、白天疲惫生成一个可执行的7天睡眠恢复计划。',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(extract).not.toHaveBeenCalled();
      expect(body.data.memoryCandidates).toBeUndefined();
      expect(body.data.planDraft).toMatchObject({
        title: '7天睡眠恢复计划',
      });

      await app.close();
    });

    it('memory extractor 抛错时不影响主响应（只跳过候选注入）', async () => {
      // 回归：extractor 失败不应让 /ai/chat 退化为 500，主 AI 响应仍要正常返回。
      const app = await buildApp({
        env: {
          FALLBACK_ONLY_MODE: 'true',
          ENABLE_GOD_MODE: 'false',
          MEMORY_BACKEND: 'memory',
        },
      });

      app.memoryServices.extractor = {
        async extract() {
          throw new Error('extractor LLM 不可用');
        },
      };

      mockedExecuteAgent.mockResolvedValueOnce(chatResponse());

      const response = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        headers: { 'x-session-id': 'sess-err-1' },
        payload: {
          profileId: 'profile-a',
          pageContext: { profileId: 'profile-a', page: 'advisor', timeframe: 'week' },
          userMessage: '我最近的睡眠怎么样？',
        },
      });

      // 主响应仍 200，summary 正常
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.summary).toBe('你的 HRV 趋势稳定');
      // extractor 抛错，候选未注入
      expect(body.data.memoryCandidates).toBeUndefined();

      await app.close();
    });

    test('合法 uiContext 原样透传给 orchestrator', async () => {
      mockedExecuteAgent.mockReset();
      mockedExecuteAgent.mockResolvedValueOnce(chatResponse());

      const response = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        payload: {
          profileId: 'profile-a',
          pageContext: defaultPageContext,
          userMessage: '在首页展示睡眠趋势简报',
          uiContext: { homepageTrendCard: 'sleep' },
        },
        headers: { 'x-session-id': 'sess-ui-1' },
      });

      expect(response.statusCode).toBe(200);
      expect(mockedExecuteAgent).toHaveBeenCalledTimes(1);
      const forwarded = mockedExecuteAgent.mock.calls[0]?.[0];
      expect(forwarded.uiContext).toStrictEqual({
        homepageTrendCard: 'sleep',
      });
    });

    test('非法 homepageTrendCard 状态返回 400 VALIDATION_ERROR', async () => {
      mockedExecuteAgent.mockReset();
      mockedExecuteAgent.mockResolvedValueOnce(chatResponse());

      const response = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        payload: {
          profileId: 'profile-a',
          pageContext: defaultPageContext,
          userMessage: '在首页展示概览',
          uiContext: { homepageTrendCard: 'overview' },
        },
        headers: { 'x-session-id': 'sess-ui-2' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(mockedExecuteAgent).not.toHaveBeenCalled();
    });

    test('请求不带 uiContext 沿用现有成功路径', async () => {
      mockedExecuteAgent.mockReset();
      mockedExecuteAgent.mockResolvedValueOnce(chatResponse());

      const response = await app.inject({
        method: 'POST',
        url: '/ai/chat',
        payload: {
          profileId: 'profile-a',
          pageContext: defaultPageContext,
          userMessage: '最近感觉怎样',
        },
        headers: { 'x-session-id': 'sess-ui-3' },
      });

      expect(response.statusCode).toBe(200);
      const forwarded = mockedExecuteAgent.mock.calls[0]?.[0];
      expect(forwarded.uiContext).toBeUndefined();
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
