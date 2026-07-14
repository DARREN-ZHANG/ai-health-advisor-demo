import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import path from 'node:path';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import {
  AgentResponseEnvelopeSchema,
  BriefStreamEventSchema,
  type AgentResponseEnvelope,
  type BriefStreamEvent,
  type PageContext,
} from '@health-advisor/shared';
import { AgentTaskType } from '@health-advisor/shared';

/**
 * 任务 4.1：首页实时简报流式传输集成测试。
 *
 * 与 modules/ai/routes.test.ts 的分工：
 * - routes.test.ts 是模块级单测，mock executeAgent，验证 route handler 的
 *   SSE 帧序列、cache hit、校验失败等路由层逻辑。
 * - 本文件是集成测试，重点验证完整协议契约：
 *   1. 后端产出的 SSE body 能被标准 SSE 分帧规则（`event:` + `data:` +
 *      空行分隔）正确解析（覆盖后端 SseWriter 当前输出格式的最小分帧实现；
 *      不处理多行 data 拼接、注释行、CRLF、retry/id 字段）。
 *   2. 每个帧的 data 通过 BriefStreamEventSchema（与前端共享的 Zod 契约）。
 *   3. completed 帧的 response 通过 AgentResponseEnvelopeSchema。
 *   4. 跨场景的 protocol invariant：started → delta* → 恰好一个 terminal。
 *
 * fake streaming HealthAgent：通过 mock executeAgent 模拟 async generator
 * 风格的 chunk 输出，按可控顺序调用 options.onSummaryDelta 推送合法 JSON
 * 片段。不使用计时 sleep，chunk 顺序即时间顺序。
 */

// mock executeAgent 以隔离真实 LLM 调用
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

/** 完整合法 envelope，所有字段通过 AgentResponseEnvelopeSchema */
const validEnvelope: AgentResponseEnvelope = {
  summary: '你的身体恢复良好，HRV 趋势稳定。',
  source: 'llm',
  statusColor: 'good',
  chartTokens: [],
  microTips: ['保持规律作息'],
  actions: [
    {
      id: 'action-breath-1',
      emoji: '🫁',
      title: 'Box breathing',
      description: '2 minutes box breathing',
      aiPromise: 'Activates parasympathetic system',
      interaction: {
        kind: 'micro_event',
        microEvent: { type: 'micro_box_breathing', durationMinutes: 2 },
      },
    },
  ],
  meta: {
    taskType: AgentTaskType.HOMEPAGE_SUMMARY,
    pageContext: defaultPageContext,
    finishReason: 'complete',
  },
};

/**
 * 解析 SSE 文本为事件数组。
 *
 * 覆盖后端 SseWriter 当前输出格式（单行 data + 单行 event + 空行分隔）的
 * 最小分帧实现；不处理多行 data 拼接、注释行、CRLF、retry/id 字段。
 * 这一步验证后端产出的 body 能被标准 SSE parser 正确分帧。
 */
function parseSseFrames(text: string): Array<{ event: string; data: unknown }> {
  const frames: Array<{ event: string; data: unknown }> = [];
  // 标准分帧：连续两个换行作为帧分隔符
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

/**
 * 把已分帧的 data 按 BriefStreamEventSchema 校验，返回强类型事件。
 * 与前端 brief-stream-client.parseAndValidate 用同一个 schema。
 */
function validateFrameSchema(
  frame: { event: string; data: unknown },
): BriefStreamEvent {
  const result = BriefStreamEventSchema.safeParse(frame.data);
  if (!result.success) {
    throw new Error(
      `帧 ${frame.event} 未通过 BriefStreamEventSchema: ${result.error.message}`,
    );
  }
  return result.data;
}

/** 断言帧序列恰好包含一个终态（completed 或 failed） */
function assertExactlyOneTerminal(
  frames: Array<{ event: string; data: unknown }>,
) {
  const terminals = frames.filter(
    (f) => f.event === 'brief.completed' || f.event === 'brief.failed',
  );
  expect(terminals, '流必须恰好以一个终态结束').toHaveLength(1);
}

describe('Morning Brief Stream 集成测试', () => {
  let app: FastifyInstance;
  let dataDir: string;

  beforeAll(async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'morning-brief-stream-int-'));
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

  /**
   * 场景 1：合法多 delta —— fake agent 产出多个 chunk 组成合法 JSON，
   * 验证 started → delta*(内容正确) → completed（完整 envelope），
   * 且每个帧通过 schema 校验，exactly-one-terminal。
   */
  test('合法多 delta：started → delta* → completed，帧通过 schema 校验', async () => {
    mockedExecuteAgent.mockReset();
    app.briefCache.clearAll();
    app.runtime.getSessionSandbox('sess-int-1').overrideStore.reset('all');

    // fake streaming agent：按可控顺序推送 delta 片段（模拟 JSON summary 增量）
    mockedExecuteAgent.mockImplementationOnce(
      async (_req, _deps, _timeout, _observer, _locale, options) => {
        const onDelta = options?.onSummaryDelta;
        if (onDelta) {
          // 模拟增量 JSON parser 释放的 summary 片段
          await onDelta('你的身体');
          await onDelta('恢复良好');
          await onDelta('，HRV 趋势稳定。');
        }
        return validEnvelope;
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
      headers: { 'x-session-id': 'sess-int-1' },
    });

    // HTTP/SSE 层：状态码、content-type、反缓冲 headers
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.headers['cache-control']).toContain('no-transform');
    expect(response.headers['x-accel-buffering']).toBe('no');
    expect(response.headers['x-session-id']).toBe('sess-int-1');

    // SSE 分帧层：后端 body 能被标准分帧规则正确解析
    const frames = parseSseFrames(response.body);
    expect(frames.length).toBeGreaterThanOrEqual(5); // started + 3 delta + completed

    // 每个帧通过共享 schema 校验（与前端 parseAndValidate 同一契约）
    const events = frames.map(validateFrameSchema);
    const types = events.map((e) => e.type);

    // 事件序列正确
    expect(types[0]).toBe('brief.started');
    expect(types[types.length - 1]).toBe('brief.completed');
    const deltaTypes = types.filter((t) => t === 'brief.summary.delta');
    expect(deltaTypes).toHaveLength(3);

    // delta 内容顺序正确
    const deltas = events
      .filter((e): e is Extract<BriefStreamEvent, { type: 'brief.summary.delta' }> =>
        e.type === 'brief.summary.delta',
      )
      .map((e) => e.delta);
    expect(deltas).toEqual(['你的身体', '恢复良好', '，HRV 趋势稳定。']);

    // completed 的 response 通过 envelope schema 校验
    const completed = events.find(
      (e): e is Extract<BriefStreamEvent, { type: 'brief.completed' }> =>
        e.type === 'brief.completed',
    );
    expect(completed).toBeDefined();
    const envelopeResult = AgentResponseEnvelopeSchema.safeParse(completed!.response);
    expect(envelopeResult.success).toBe(true);

    // 恰好一个终态
    assertExactlyOneTerminal(frames);
  });

  /**
   * 场景 2：cache hit 直达 completed —— 预填缓存，验证 SSE 只有
   * started → completed（无 delta），finishReason 为 'cached'。
   *
   * 跨 endpoint 缓存共享：JSON 与 stream 共享 briefCache
   *（key = profileId + pageContext + promptVersion + modelVersion + locale），
   * 故先用 JSON route 填充缓存，再用 stream route 验证命中。
   */
  test('cache hit 直达 completed（无 delta），finishReason=cached', async () => {
    mockedExecuteAgent.mockReset();
    app.runtime.getSessionSandbox('sess-int-2').overrideStore.reset('all');

    // 第一次调用 JSON route 产生缓存
    mockedExecuteAgent.mockResolvedValueOnce(validEnvelope);
    const fillResponse = await app.inject({
      method: 'POST',
      url: '/ai/morning-brief',
      payload: { profileId: 'profile-a', pageContext: defaultPageContext },
      headers: { 'x-session-id': 'sess-int-2' },
    });
    expect(fillResponse.statusCode).toBe(200);

    // 第二次 stream 调用应命中缓存，不调用 executeAgent
    mockedExecuteAgent.mockClear();

    const response = await app.inject({
      method: 'POST',
      url: '/ai/morning-brief/stream',
      payload: { profileId: 'profile-a', pageContext: defaultPageContext },
      headers: { 'x-session-id': 'sess-int-2' },
    });

    expect(response.statusCode).toBe(200);
    const frames = parseSseFrames(response.body);
    const events = frames.map(validateFrameSchema);
    const types = events.map((e) => e.type);

    // 只有 started + completed，无 delta
    expect(types).toEqual(['brief.started', 'brief.completed']);
    expect(types).not.toContain('brief.summary.delta');
    expect(mockedExecuteAgent).not.toHaveBeenCalled();

    // cache hit 的 finishReason 保留 'cached'
    const completed = events.find(
      (e): e is Extract<BriefStreamEvent, { type: 'brief.completed' }> =>
        e.type === 'brief.completed',
    );
    expect(completed).toBeDefined();
    expect(completed!.response.meta.finishReason).toBe('cached');

    assertExactlyOneTerminal(frames);
  });

  /**
   * 场景 3：invalid JSON failed —— fake agent 产出 fallback（finishReason
   * 非 complete/cached），验证 started → failed，无 completed。
   */
  test('fallback finishReason 发 failed terminal（无 completed）', async () => {
    mockedExecuteAgent.mockReset();
    app.briefCache.clearAll();
    app.runtime.getSessionSandbox('sess-int-3').overrideStore.reset('all');

    const fallbackResponse: AgentResponseEnvelope = {
      ...validEnvelope,
      source: 'fallback',
      statusColor: 'warning',
      meta: { ...validEnvelope.meta, finishReason: 'fallback' },
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
      headers: { 'x-session-id': 'sess-int-3' },
    });

    expect(response.statusCode).toBe(200);
    const frames = parseSseFrames(response.body);
    const events = frames.map(validateFrameSchema);
    const types = events.map((e) => e.type);

    expect(types[0]).toBe('brief.started');
    expect(types[types.length - 1]).toBe('brief.failed');
    expect(types).not.toContain('brief.completed');

    const failed = events.find(
      (e): e is Extract<BriefStreamEvent, { type: 'brief.failed' }> =>
        e.type === 'brief.failed',
    );
    expect(failed).toBeDefined();
    expect(failed!.error.code).toBe('BRIEF_GENERATION_FAILED');

    assertExactlyOneTerminal(frames);
  });

  /**
   * 场景 4：provider exception —— fake agent 抛错，验证 started → failed。
   */
  test('provider 抛异常发 failed terminal', async () => {
    mockedExecuteAgent.mockReset();
    app.briefCache.clearAll();
    app.runtime.getSessionSandbox('sess-int-4').overrideStore.reset('all');

    mockedExecuteAgent.mockRejectedValueOnce(new Error('provider connection failed'));

    const response = await app.inject({
      method: 'POST',
      url: '/ai/morning-brief/stream',
      payload: {
        profileId: 'profile-a',
        pageContext: defaultPageContext,
        bustCache: true,
      },
      headers: { 'x-session-id': 'sess-int-4' },
    });

    expect(response.statusCode).toBe(200);
    const frames = parseSseFrames(response.body);
    const events = frames.map(validateFrameSchema);
    const types = events.map((e) => e.type);

    expect(types[0]).toBe('brief.started');
    expect(types[types.length - 1]).toBe('brief.failed');
    expect(types).not.toContain('brief.completed');

    assertExactlyOneTerminal(frames);
  });

  /**
   * 场景 5：断连 abort —— 验证 onDisconnect 链路正确注册。
   *
   * 通过 preHandler 捕获 request.raw，在首次 delta 后 emit('aborted')，
   * 验证 abortController.abort() 被调用（signal.aborted === true）。
   * 独立 app 实例避免 preHandler hook 污染全局 app。
   *
   * 真实场景下 abort 后底层 provider 会抛 AbortError，routes 走 catch 发 failed；
   * 这里 mock executeAgent 不监听 signal，直接返回 validEnvelope 走 completed——
   * 验证的是 abort 信号透传链路注册正确，不验证 provider 取消语义
   *（由 agent-core 单测覆盖）。
   */
  test('客户端断连触发 abortController.abort()（signal 透传链路）', async () => {
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
    localApp.runtime.getSessionSandbox('sess-int-abort').overrideStore.reset('all');

    let signalAfterAbort: boolean | undefined;
    let deltaCountAfterAbort = 0;
    mockedExecuteAgent.mockImplementationOnce(
      async (_req, _deps, _timeout, _observer, _locale, options) => {
        const onDelta = options?.onSummaryDelta;
        const signal = options?.signal;
        if (onDelta) {
          await onDelta('你的身体');
          // 模拟客户端断连：emit 同步触发 onDisconnect → abortController.abort()
          capturedRaw?.emit('aborted');
          signalAfterAbort = signal?.aborted;
          // 第二次 delta：验证 writer 守卫不会因 abort 误关闭
          await onDelta('恢复良好');
          deltaCountAfterAbort++;
        }
        return validEnvelope;
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
      headers: { 'x-session-id': 'sess-int-abort' },
    });

    // 断言：emit('aborted') 后 onDisconnect 调用了 abortController.abort()
    expect(signalAfterAbort).toBe(true);
    expect(deltaCountAfterAbort).toBe(1);

    expect(response.statusCode).toBe(200);
    const frames = parseSseFrames(response.body);
    const events = frames.map(validateFrameSchema);
    const types = events.map((e) => e.type);

    // SSE 流仍以合法终端结束（started → delta* → completed）
    expect(types[0]).toBe('brief.started');
    expect(types[types.length - 1]).toBe('brief.completed');
    assertExactlyOneTerminal(frames);

    await localApp.close();
  });

  /**
   * 场景 6：校验失败返回 400 JSON（不进入 SSE）。
   * 验证 stream route 的校验在 hijack 之前完成。
   */
  test('无效 pageContext 返回 400 JSON（不进入 SSE）', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/ai/morning-brief/stream',
      payload: {
        profileId: 'profile-a',
        pageContext: { invalid: true },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/json');
    const body = response.json();
    expect(body.success).toBe(false);
  });

  /**
   * 场景 7：客户端 X-Request-Id header 决定 SSE 帧的 requestId。
   *
   * 任务 4.1 的核心 bug 是「client 没发 X-Request-Id 导致前后端 requestId
   * 不一致」。client 单测验证了 client 发 header；本场景是集成层唯一能锁定
   *「Fastify request-context 会采纳客户端 X-Request-Id header 并透传到每个
   * SSE 帧」这条契约的地方 —— 若删掉 request-context.ts 的 header 读取或
   * app.ts 的 requestIdHeader 配置，本场景会红。
   *
   * 显式发 X-Request-Id: req-explicit-001，断言：
   * - started / 每个 delta / completed 的 requestId 全等于 'req-explicit-001'
   */
  test('客户端 X-Request-Id header 决定 SSE 帧的 requestId（端到端契约）', async () => {
    mockedExecuteAgent.mockReset();
    app.briefCache.clearAll();
    app.runtime.getSessionSandbox('sess-int-reqid').overrideStore.reset('all');

    // fake streaming agent：推送 2 个 delta，验证每个 delta 帧都带客户端 requestId
    mockedExecuteAgent.mockImplementationOnce(
      async (_req, _deps, _timeout, _observer, _locale, options) => {
        const onDelta = options?.onSummaryDelta;
        if (onDelta) {
          await onDelta('你的身体');
          await onDelta('恢复良好');
        }
        return validEnvelope;
      },
    );

    const explicitRequestId = 'req-explicit-001';
    const response = await app.inject({
      method: 'POST',
      url: '/ai/morning-brief/stream',
      payload: {
        profileId: 'profile-a',
        pageContext: defaultPageContext,
        bustCache: true,
      },
      headers: {
        'x-session-id': 'sess-int-reqid',
        'x-request-id': explicitRequestId,
      },
    });

    expect(response.statusCode).toBe(200);
    const frames = parseSseFrames(response.body);
    const events = frames.map(validateFrameSchema);
    const types = events.map((e) => e.type);

    // 序列正确：started → 2× delta → completed
    expect(types[0]).toBe('brief.started');
    expect(types[types.length - 1]).toBe('brief.completed');
    expect(types.filter((t) => t === 'brief.summary.delta')).toHaveLength(2);

    // 核心契约：每个帧的 requestId 都等于客户端 X-Request-Id header
    // 锁定「Fastify request-context 用客户端 header」+「SseWriter/routes 透传 ctx.requestId」
    for (const event of events) {
      expect(event.requestId).toBe(explicitRequestId);
    }

    // 显式抽样三处关键帧，便于失败时快速定位是哪一类帧漏透传
    const started = events.find(
      (e): e is Extract<BriefStreamEvent, { type: 'brief.started' }> =>
        e.type === 'brief.started',
    );
    expect(started?.requestId).toBe(explicitRequestId);

    const delta = events.find(
      (e): e is Extract<BriefStreamEvent, { type: 'brief.summary.delta' }> =>
        e.type === 'brief.summary.delta',
    );
    expect(delta?.requestId).toBe(explicitRequestId);

    const completed = events.find(
      (e): e is Extract<BriefStreamEvent, { type: 'brief.completed' }> =>
        e.type === 'brief.completed',
    );
    expect(completed?.requestId).toBe(explicitRequestId);

    assertExactlyOneTerminal(frames);
  });
});
