import { once } from 'node:events';
import type { FastifyReply } from 'fastify';
import {
  BriefStreamEventSchema,
  type BriefStreamEvent,
} from '@health-advisor/shared';

/**
 * SSE writer：把已通过 shared schema 的 BriefStreamEvent 序列化为单行 JSON data，
 * 写入 Fastify reply.raw。
 *
 * 设计要点：
 * - **schema 校验**：每次写入都 BriefStreamEventSchema.safeParse，防御性守卫，
 *   确保事件结构始终合法（即使调用方误传）。
 * - **exactly-one-terminal**：terminalSent 后任何写入都被拒绝（writeEvent 返回，
 *   不抛错），保证流协议 invariant（started → delta* → 终态唯一）。
 * - **背压等待**：reply.raw.write 返回 false 时 await 一次 'drain' 事件，
 *   避免消费端慢导致 buffer 无限增长。
 * - **close 守卫**：close() 后禁止任何写入，防止 hijack 后 reply.raw.end() 被
 *   重复调用或 race。
 *
 * 不负责 hijack 或 headers 设置：调用方应在 startSseHeaders 之前用
 * reply.hijack() 接管 reply.raw，再调用 startSseHeaders 写入状态行与 headers。
 */
export interface SseWriterOptions {
  reply: FastifyReply;
  requestId: string;
}

export class SseWriter {
  private closed = false;
  private terminalSent = false;
  private readonly reply: FastifyReply;
  private readonly requestId: string;

  constructor(options: SseWriterOptions) {
    this.reply = options.reply;
    this.requestId = options.requestId;
  }

  /** 是否已关闭（end 已调用或 terminal 已写） */
  get isClosed(): boolean {
    return this.closed;
  }

  /** 是否已发送终态事件（completed/failed） */
  get hasTerminal(): boolean {
    return this.terminalSent;
  }

  /**
   * 写入 SSE 状态行与 headers。
   *
   * 调用前必须已 reply.hijack()（由 route handler 负责）。hijack 后 Fastify
   * 不再设置 headers 或处理 payload，因此 SSE headers 通过 reply.raw.writeHead
   * 一次性写入。X-Session-Id 需在此时写入——onSend hook 在 hijack 后不会触发，
   * 因此原 JSON route 中 onSend 设置 session 的机制对 SSE 不生效。
   */
  startSseHeaders(sessionId?: string): void {
    if (this.closed) {
      throw new Error('SseWriter 已关闭，不能写入 headers');
    }
    const headers: Record<string, string> = {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    };
    if (sessionId) {
      headers['X-Session-Id'] = sessionId;
    }
    this.reply.raw.writeHead(200, headers);
  }

  /**
   * 写入一个事件（started 或 delta）。终态事件请用 writeTerminal。
   *
   * 返回值：true 表示已写入；false 表示因 closed/terminal 已发送而跳过。
   */
  async writeEvent(event: BriefStreamEvent): Promise<boolean> {
    if (this.closed || this.terminalSent) {
      return false;
    }
    const frame = serializeSseFrame(event);
    const ok = this.reply.raw.write(frame);
    if (!ok && !this.reply.raw.destroyed) {
      // 背压：等待 drain，避免 buffer 溢出
      await once(this.reply.raw, 'drain');
    }
    return true;
  }

  /**
   * 写入终态事件（completed/failed）然后结束流。
   *
   * exactly-one-terminal：若已发送过 terminal，则不重复发送。
   * 若 reply.raw 已 writableEnded，则不再 end（防止重复 end 触发错误事件）。
   */
  async writeTerminal(event: BriefStreamEvent): Promise<void> {
    if (this.terminalSent || this.closed) {
      return;
    }
    const frame = serializeSseFrame(event);
    if (!this.reply.raw.writableEnded) {
      const ok = this.reply.raw.write(frame);
      if (!ok && !this.reply.raw.destroyed) {
        await once(this.reply.raw, 'drain');
      }
      this.reply.raw.end();
    }
    this.terminalSent = true;
    this.closed = true;
  }

  /**
   * 强制关闭流（不写任何 frame），用于异常路径（如 reply.raw 已被上游关闭）。
   * 若已 writableEnded，则跳过 end。
   */
  close(): void {
    if (this.closed) return;
    if (!this.reply.raw.writableEnded && !this.reply.raw.destroyed) {
      this.reply.raw.end();
    }
    this.closed = true;
  }
}

/**
 * 序列化 BriefStreamEvent 为 SSE 帧。
 *
 * 格式：
 * ```
 * event: <type>\n
 * data: <单行 JSON>\n
 * \n
 * ```
 *
 * 内含 BriefStreamEventSchema.safeParse 校验。若 event 非法，抛错（契约保证：
 * writer 只发已通过 schema 的事件）。调用方应在构造 event 时就保证合法，
 * 这里的校验是防御性兜底。
 */
function serializeSseFrame(event: BriefStreamEvent): string {
  const result = BriefStreamEventSchema.safeParse(event);
  if (!result.success) {
    throw new Error(`SseWriter 收到非法事件：${result.error.message}`);
  }
  const json = JSON.stringify(result.data);
  return `event: ${event.type}\ndata: ${json}\n\n`;
}
