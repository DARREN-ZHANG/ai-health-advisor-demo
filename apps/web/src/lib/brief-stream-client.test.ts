/**
 * brief-stream-client 测试。
 *
 * 覆盖范围(按任务要求):
 * 1. 合法完整流:started → delta* → completed,onEvent 收齐,Promise resolve
 * 2. 任意网络 chunk 边界:一个 event 跨多个 chunk
 * 3. 同一 SSE data 字段跨 chunk
 * 4. 多个 event 同 chunk
 * 5. failed 终态:reject with BriefStreamError
 * 6. HTTP 4xx + JSON error body:reject
 * 7. 截断流(EOF 无 terminal):reject
 * 8. 重复 terminal(completed → completed):reject
 * 9. requestId 不匹配:reject
 * 10. 未知 event type(schema 拒绝):reject
 * 11. AbortError:传播
 * 12. HTTP 2xx 但 response.body 为 null:reject
 * 13. session-id 从 response header 提取并缓存
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BriefStreamError,
  streamMorningBrief,
  type MorningBriefRequest,
} from './brief-stream-client';
import {
  setSessionId,
  clearSessionId,
  type ApiError,
} from './api-client';
import type {
  BriefStreamEvent,
  BriefStartedEvent,
  BriefSummaryDeltaEvent,
  BriefCompletedEvent,
  BriefFailedEvent,
  AgentResponseEnvelope,
} from '@health-advisor/shared';
import { ChartTokenId, AgentTaskType } from '@health-advisor/shared';

// ---- 测试常量与工厂 ----

const REQUEST_ID = 'req-test-001';
const PROFILE_ID = 'profile-a';

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

const VALID_ENVELOPE: AgentResponseEnvelope = {
  summary: '今日 HRV 表现优秀,建议保持当前节奏。',
  source: 'agent-streaming-test',
  statusColor: 'good',
  chartTokens: [ChartTokenId.HRV_7DAYS],
  microTips: ['保持充足睡眠'],
  meta: {
    taskType: AgentTaskType.HOMEPAGE_SUMMARY,
    pageContext: {
      profileId: PROFILE_ID,
      page: 'homepage',
      timeframe: 'week',
    },
    finishReason: 'complete',
    sessionId: 'sess-xyz',
  },
};

function makeStarted(requestId = REQUEST_ID): BriefStartedEvent {
  return { type: 'brief.started', requestId };
}

function makeDelta(delta: string, requestId = REQUEST_ID): BriefSummaryDeltaEvent {
  return { type: 'brief.summary.delta', requestId, delta };
}

function makeCompleted(
  envelope: AgentResponseEnvelope = VALID_ENVELOPE,
  requestId = REQUEST_ID,
): BriefCompletedEvent {
  return { type: 'brief.completed', requestId, response: envelope };
}

function makeFailed(
  code: 'BRIEF_GENERATION_FAILED' | 'STREAM_ABORTED' = 'BRIEF_GENERATION_FAILED',
  message = '生成失败',
  requestId = REQUEST_ID,
): BriefFailedEvent {
  return { type: 'brief.failed', requestId, error: { code, message } };
}

/** 把 SSE event 序列化成符合 SSE 规范的文本块(event + data 行 + 终止空行) */
function sseFrame(event: BriefStreamEvent): string {
  const json = JSON.stringify(event);
  return `event: ${event.type}\ndata: ${json}\n\n`;
}

/**
 * 构造可控的 ReadableStream<Uint8Array>,按指定的 chunk 字符串序列推送,
 * 推完后关闭流。用于精确模拟任意网络分包边界。
 */
function createChunkedStream(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });
}

/** 构造完整的 SSE response,把多个 event 序列化为单个 chunk */
function createSSEResponse(
  events: BriefStreamEvent[],
  options: { chunks?: string[]; status?: number; headers?: Record<string, string> } = {},
): Response {
  const { chunks, status = 200, headers = {} } = options;
  const body =
    chunks ?? [events.map(sseFrame).join('')];
  return new Response(createChunkedStream(body), {
    status,
    headers: {
      'Content-Type': 'text/event-stream',
      'X-Session-Id': 'sess-from-server',
      ...headers,
    },
  });
}

function createJsonErrorResponse(
  status: number,
  errorBody: { code: string; message: string },
): Response {
  return new Response(JSON.stringify({ success: false, error: errorBody, data: null }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makePayload(): MorningBriefRequest {
  return {
    profileId: PROFILE_ID,
    pageContext: {
      profileId: PROFILE_ID,
      page: 'homepage',
      timeframe: 'week',
    },
  };
}

function makeOptions(onEvent: (e: BriefStreamEvent) => void, signal?: AbortSignal) {
  return {
    requestId: REQUEST_ID,
    signal: signal ?? new AbortController().signal,
    onEvent,
  };
}

describe('streamMorningBrief', () => {
  beforeEach(() => {
    const storage = createMemoryStorage();
    vi.stubGlobal('window', { localStorage: storage });
    clearSessionId();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ---- 1. 合法完整流 ----
  it('合法完整流:onEvent 收齐事件,Promise resolve 完整 envelope', async () => {
    const events = [makeStarted(), makeDelta('Hello'), makeDelta(' world'), makeCompleted()];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(createSSEResponse(events));

    const received: BriefStreamEvent[] = [];
    const envelope = await streamMorningBrief(
      makePayload(),
      makeOptions((e) => received.push(e)),
    );

    expect(envelope).toEqual(VALID_ENVELOPE);
    expect(received.map((e) => e.type)).toEqual([
      'brief.started',
      'brief.summary.delta',
      'brief.summary.delta',
      'brief.completed',
    ]);
    expect(fetchSpy).toHaveBeenCalledOnce();
    // 校验请求方法与 body
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual(makePayload());
  });

  // ---- 2. 任意网络 chunk 边界 ----
  it('event 跨多个 chunk 仍能正确解析', async () => {
    const fullFrame = sseFrame(makeStarted()) + sseFrame(makeDelta('Hi')) + sseFrame(makeCompleted());
    // 把完整文本切成不等长的小片段
    const chunks = [
      fullFrame.slice(0, 5),
      fullFrame.slice(5, 20),
      fullFrame.slice(20, 40),
      fullFrame.slice(40),
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createSSEResponse([], { chunks }),
    );

    const received: string[] = [];
    const envelope = await streamMorningBrief(
      makePayload(),
      makeOptions((e) => received.push(e.type)),
    );

    expect(envelope).toEqual(VALID_ENVELOPE);
    expect(received).toEqual([
      'brief.started',
      'brief.summary.delta',
      'brief.completed',
    ]);
  });

  // ---- 3. 同一 SSE data 字段跨 chunk ----
  it('一个 event 的 data 行被拆到多个 chunk 仍能拼接', async () => {
    // 构造一个 started event,其 data 行的 JSON 被切成多段
    const startedJson = JSON.stringify(makeStarted());
    const chunks = [
      `event: brief.started\ndata: ${startedJson.slice(0, 10)}`,
      `${startedJson.slice(10)}\n\n`,
      sseFrame(makeCompleted()),
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createSSEResponse([], { chunks }),
    );

    const envelope = await streamMorningBrief(
      makePayload(),
      makeOptions(() => {}),
    );

    expect(envelope).toEqual(VALID_ENVELOPE);
  });

  // ---- 4. 多个 event 同 chunk ----
  it('多个 event 在同一 chunk 中仍能分别解析', async () => {
    const allFrames = sseFrame(makeStarted()) + sseFrame(makeDelta('A')) + sseFrame(makeCompleted());
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createSSEResponse([], { chunks: [allFrames] }),
    );

    const received: string[] = [];
    await streamMorningBrief(
      makePayload(),
      makeOptions((e) => received.push(e.type)),
    );

    expect(received).toEqual([
      'brief.started',
      'brief.summary.delta',
      'brief.completed',
    ]);
  });

  // ---- 5. failed 终态 ----
  it('brief.failed 事件触发 reject(BriefStreamError)', async () => {
    const events = [makeStarted(), makeDelta('partial'), makeFailed('STREAM_ABORTED', '被中止')];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(createSSEResponse(events));

    await expect(
      streamMorningBrief(makePayload(), makeOptions(() => {})),
    ).rejects.toMatchObject({
      name: 'BriefStreamError',
      code: 'STREAM_ABORTED',
      message: '被中止',
    });
  });

  // ---- 6. HTTP 4xx + JSON error body ----
  it('HTTP 4xx 返回 JSON error body 时 reject', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createJsonErrorResponse(422, {
        code: 'VALIDATION_ERROR',
        message: 'profileId 缺失',
      }),
    );

    await expect(
      streamMorningBrief(makePayload(), makeOptions(() => {})),
    ).rejects.toMatchObject({
      name: 'BriefStreamError',
      code: 'VALIDATION_ERROR',
      message: 'profileId 缺失',
    });
  });

  it('HTTP 5xx 返回非 JSON body 时 reject 兜底错误', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal Server Error', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );

    await expect(
      streamMorningBrief(makePayload(), makeOptions(() => {})),
    ).rejects.toMatchObject({
      name: 'BriefStreamError',
    });
  });

  // ---- 7. 截断流(EOF 无 terminal) ----
  it('EOF 前未收到 terminal 事件时 reject', async () => {
    const events = [makeStarted(), makeDelta('partial')];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(createSSEResponse(events));

    await expect(
      streamMorningBrief(makePayload(), makeOptions(() => {})),
    ).rejects.toMatchObject({
      name: 'BriefStreamError',
      code: 'STREAM_EOF_WITHOUT_TERMINAL',
    });
  });

  // ---- 8. 重复 terminal ----
  it('terminal 之后再收到任何事件都 reject(重复 terminal)', async () => {
    // completed 后再跟一个 completed
    const fullFrames = sseFrame(makeStarted()) + sseFrame(makeCompleted()) + sseFrame(makeCompleted());
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createSSEResponse([], { chunks: [fullFrames] }),
    );

    await expect(
      streamMorningBrief(makePayload(), makeOptions(() => {})),
    ).rejects.toMatchObject({
      name: 'BriefStreamError',
      code: 'STREAM_UNEXPECTED_EVENT_AFTER_TERMINAL',
    });
  });

  it('terminal 后再收到 delta 也 reject', async () => {
    const fullFrames = sseFrame(makeStarted()) + sseFrame(makeCompleted()) + sseFrame(makeDelta('late'));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createSSEResponse([], { chunks: [fullFrames] }),
    );

    await expect(
      streamMorningBrief(makePayload(), makeOptions(() => {})),
    ).rejects.toMatchObject({
      name: 'BriefStreamError',
      code: 'STREAM_UNEXPECTED_EVENT_AFTER_TERMINAL',
    });
  });

  // ---- 9. requestId 不匹配 ----
  it('事件的 requestId 与 options.requestId 不一致时 reject', async () => {
    const wrongStarted: BriefStartedEvent = {
      type: 'brief.started',
      requestId: 'req-different',
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createSSEResponse([wrongStarted]),
    );

    await expect(
      streamMorningBrief(makePayload(), makeOptions(() => {})),
    ).rejects.toMatchObject({
      name: 'BriefStreamError',
      code: 'STREAM_REQUEST_ID_MISMATCH',
    });
  });

  // ---- 10. 未知 event type / schema 拒绝 ----
  it('未知 event type 被 schema 拒绝时 reject', async () => {
    // 手工构造非法 SSE 帧(schema 会拒绝)
    const unknownJson = JSON.stringify({ type: 'brief.unknown', requestId: REQUEST_ID });
    const chunks = [`event: brief.unknown\ndata: ${unknownJson}\n\n`];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createSSEResponse([], { chunks }),
    );

    await expect(
      streamMorningBrief(makePayload(), makeOptions(() => {})),
    ).rejects.toMatchObject({
      name: 'BriefStreamError',
      code: 'STREAM_INVALID_EVENT',
    });
  });

  it('data 字段非合法 JSON 时 reject', async () => {
    const chunks = ['event: brief.started\ndata: {not-json}\n\n'];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createSSEResponse([], { chunks }),
    );

    await expect(
      streamMorningBrief(makePayload(), makeOptions(() => {})),
    ).rejects.toMatchObject({
      name: 'BriefStreamError',
      code: 'STREAM_INVALID_EVENT',
    });
  });

  // ---- 11. AbortError ----
  it('AbortSignal 已 aborted 时 fetch 抛 AbortError,client 透传', async () => {
    const controller = new AbortController();
    controller.abort();
    const abortError = new DOMException('aborted', 'AbortError');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError);

    await expect(
      streamMorningBrief(
        makePayload(),
        makeOptions(() => {}, controller.signal),
      ),
    ).rejects.toBe(abortError);
  });

  it('fetch 返回的 response.body 为 null 时 reject', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );

    await expect(
      streamMorningBrief(makePayload(), makeOptions(() => {})),
    ).rejects.toMatchObject({
      name: 'BriefStreamError',
      code: 'STREAM_NO_BODY',
    });
  });

  // ---- session-id 提取 ----
  it('收到 2xx response 后立即从 X-Session-Id header 缓存 session', async () => {
    const events = [makeStarted(), makeCompleted()];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(createSSEResponse(events));

    await streamMorningBrief(makePayload(), makeOptions(() => {}));

    expect(window.localStorage.getItem('session-id')).toBe('sess-from-server');
  });

  it('已在 localStorage 中的 session-id 会作为请求头发送', async () => {
    setSessionId('sess-existing');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(createSSEResponse([makeStarted(), makeCompleted()]));

    await streamMorningBrief(makePayload(), makeOptions(() => {}));

    const [, init] = fetchSpy.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get('X-Session-Id')).toBe('sess-existing');
    expect(headers.get('X-Lang')).toBe('zh');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  // ---- delta 必须在 completed 之前出现(协议顺序简化校验由 schema + 状态机保证) ----
  it('未收到 started 直接 delta 也接受(schema 不强制顺序,状态机只管 terminal)', async () => {
    // 这里不强行要求顺序严格(后端契约保证),只验证状态机的核心:terminal 唯一性
    const events = [makeDelta('Hi'), makeCompleted()];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(createSSEResponse(events));

    const envelope = await streamMorningBrief(
      makePayload(),
      makeOptions(() => {}),
    );
    expect(envelope).toEqual(VALID_ENVELOPE);
  });

  // ---- BriefStreamError 类型守卫 ----
  it('BriefStreamError 暴露 code 字段以便消费方区分', () => {
    const err = new BriefStreamError('VALIDATION_ERROR', 'msg', 422);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.status).toBe(422);
    expect(err.name).toBe('BriefStreamError');
    expect(err.message).toBe('msg');
    expect(err instanceof Error).toBe(true);
  });

  // ---- 区分 BriefStreamError 与 ApiError(消费方可能联合判断) ----
  it('BriefStreamError 不与 ApiError 混淆(独立的类)', async () => {
    const events = [makeStarted(), makeFailed('BRIEF_GENERATION_FAILED', 'fail')];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(createSSEResponse(events));

    try {
      await streamMorningBrief(makePayload(), makeOptions(() => {}));
      expect.fail('应抛 BriefStreamError');
    } catch (e) {
      expect(e).toBeInstanceOf(BriefStreamError);
      // 不应是 ApiError 的实例
      const { ApiError } = await import('./api-client');
      expect(e instanceof (ApiError as unknown as { new (): Error })).toBe(false);
      // 但满足 ApiError 的形状兼容性(用于 catch 联合类型)
      const apiErrShape = e as ApiError;
      expect(typeof apiErrShape.code).toBe('string');
      expect(typeof apiErrShape.status).toBe('number');
    }
  });
});
