import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import type { FastifyReply } from 'fastify';
import { SseWriter } from '../../utils/sse-writer';

/**
 * 构造一个 mock reply.raw，提供 writeHead/write/end/on/once/destroy 等
 * Node HTTP ServerResponse 接口的子集。EventEmitter 支持 drain 监听。
 */
function makeReply(): {
  reply: FastifyReply;
  getOutput: () => string;
  getHeaders: () => Record<string, string>;
  raw: MockRaw;
} {
  const chunks: string[] = [];
  const headers: Record<string, string> = {};
  const raw = new MockRaw(chunks, headers);
  return {
    reply: { raw } as unknown as FastifyReply,
    getOutput: () => chunks.join(''),
    getHeaders: () => headers,
    raw,
  };
}

class MockRaw extends EventEmitter {
  writableEnded = false;
  destroyed = false;
  headersSent = false;
  constructor(
    private readonly chunks: string[],
    private readonly headers: Record<string, string>,
  ) {
    super();
  }
  writeHead(_status: number, headers: Record<string, string>) {
    // 统一用小写键存储，模拟 Node http ServerResponse 的行为
    for (const [k, v] of Object.entries(headers)) {
      this.headers[k.toLowerCase()] = v;
    }
    this.headersSent = true;
  }
  getHeader(name: string): string | undefined {
    return this.headers[name.toLowerCase()];
  }
  write(data: string): boolean {
    this.chunks.push(data);
    return true;
  }
  end(data?: string) {
    if (data) this.chunks.push(data);
    this.writableEnded = true;
  }
  destroy() {
    this.destroyed = true;
  }
}

describe('SseWriter', () => {
  it('startSseHeaders 写入 SSE headers（含 X-Session-Id）', () => {
    const { reply } = makeReply();
    const writer = new SseWriter({ reply, requestId: 'req-1' });
    writer.startSseHeaders('sess-1');

    expect(reply.raw.headersSent).toBe(true);
    expect(reply.raw.getHeader('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(reply.raw.getHeader('cache-control')).toBe('no-cache, no-transform');
    expect(reply.raw.getHeader('connection')).toBe('keep-alive');
    expect(reply.raw.getHeader('x-accel-buffering')).toBe('no');
    expect(reply.raw.getHeader('x-session-id')).toBe('sess-1');
  });

  it('startSseHeaders 不传 sessionId 时不写 X-Session-Id', () => {
    const { reply } = makeReply();
    const writer = new SseWriter({ reply, requestId: 'req-1' });
    writer.startSseHeaders();

    expect(reply.raw.getHeader('x-session-id')).toBeUndefined();
  });

  it('writeEvent 写入 started 与 delta 的 SSE 帧', async () => {
    const { reply, getOutput } = makeReply();
    const writer = new SseWriter({ reply, requestId: 'req-1' });
    writer.startSseHeaders();

    await writer.writeEvent({ type: 'brief.started', requestId: 'req-1' });
    await writer.writeEvent({ type: 'brief.summary.delta', requestId: 'req-1', delta: '你好' });
    await writer.writeEvent({ type: 'brief.summary.delta', requestId: 'req-1', delta: '世界' });

    const output = getOutput();
    expect(output).toContain('event: brief.started');
    expect(output).toContain('"type":"brief.started","requestId":"req-1"');
    expect(output).toContain('event: brief.summary.delta');
    expect(output).toContain('"delta":"你好"');
    expect(output).toContain('"delta":"世界"');
  });

  it('writeTerminal 写入终态并 end，其后写入被拒绝', async () => {
    const { reply, getOutput } = makeReply();
    const writer = new SseWriter({ reply, requestId: 'req-1' });
    writer.startSseHeaders();

    await writer.writeTerminal({
      type: 'brief.completed',
      requestId: 'req-1',
      response: {
        summary: 'ok',
        source: 'llm',
        statusColor: 'good',
        chartTokens: [],
        meta: {
          taskType: 'homepage_summary',
          pageContext: { profileId: 'p', page: 'home', timeframe: 'week' },
          finishReason: 'complete',
        },
      },
    });

    expect(writer.hasTerminal).toBe(true);
    expect(writer.isClosed).toBe(true);
    expect(reply.raw.writableEnded).toBe(true);

    const output = getOutput();
    expect(output).toContain('event: brief.completed');

    // terminal 之后再 writeEvent 不应抛错，返回 false
    const result = await writer.writeEvent({ type: 'brief.started', requestId: 'req-1' });
    expect(result).toBe(false);

    // terminal 之后再 writeTerminal 也不应重复 end
    await writer.writeTerminal({
      type: 'brief.completed',
      requestId: 'req-1',
      response: {
        summary: 'ok2',
        source: 'llm',
        statusColor: 'good',
        chartTokens: [],
        meta: {
          taskType: 'homepage_summary',
          pageContext: { profileId: 'p', page: 'home', timeframe: 'week' },
          finishReason: 'complete',
        },
      },
    });
    // 输出不应包含第二个 ok2
    expect(output).not.toContain('ok2');
  });

  it('writeTerminal 写入 failed 终态', async () => {
    const { reply, getOutput } = makeReply();
    const writer = new SseWriter({ reply, requestId: 'req-1' });
    writer.startSseHeaders();

    await writer.writeTerminal({
      type: 'brief.failed',
      requestId: 'req-1',
      error: { code: 'BRIEF_GENERATION_FAILED', message: '失败' },
    });

    expect(writer.hasTerminal).toBe(true);
    expect(writer.isClosed).toBe(true);
    const output = getOutput();
    expect(output).toContain('event: brief.failed');
    expect(output).toContain('"code":"BRIEF_GENERATION_FAILED"');
  });

  it('非法 event 被 serialize 拒绝（schema 校验）', async () => {
    const { reply } = makeReply();
    const writer = new SseWriter({ reply, requestId: 'req-1' });
    writer.startSseHeaders();

    // 空 delta 会被 schema 拒绝（delta 必须非空）
    await expect(
      writer.writeEvent({
        type: 'brief.summary.delta',
        requestId: 'req-1',
        delta: '',
      } as never),
    ).rejects.toThrow(/非法事件/);
  });

  it('close 后 writeEvent 返回 false', async () => {
    const { reply } = makeReply();
    const writer = new SseWriter({ reply, requestId: 'req-1' });
    writer.startSseHeaders();
    writer.close();

    expect(writer.isClosed).toBe(true);
    const result = await writer.writeEvent({ type: 'brief.started', requestId: 'req-1' });
    expect(result).toBe(false);
  });

  it('startSseHeaders 在 close 后抛错', () => {
    const { reply } = makeReply();
    const writer = new SseWriter({ reply, requestId: 'req-1' });
    writer.close();
    expect(() => writer.startSseHeaders()).toThrow(/已关闭/);
  });
});
