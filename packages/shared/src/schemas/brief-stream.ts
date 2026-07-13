import { z } from 'zod';
import { AgentResponseEnvelopeSchema } from './agent';
import { BRIEF_STREAM_ERROR_CODES } from '../types/brief-stream';
import type { BriefStreamEvent } from '../types/brief-stream';

/**
 * 首页实时简报 SSE 事件的 Zod schema。
 *
 * 与 types/brief-stream.ts 的 BriefStreamEvent 一一对应：
 * 后端 agent-api 用它校验/序列化输出，前端 web 用它校验入站事件，
 * 两端共用同一份 schema 保证契约不漂移。
 *
 * 安全意图：schema 字段定义本身只暴露可对外的事件结构
 * （requestId / delta / 响应信封 / 受控错误码），
 * 不包含 provider 原始错误、API key、base URL 或 prompt ——
 * 消费方拿到的字段集合天然不含敏感数据。
 */
const requestIdSchema = z.string().min(1);

const BriefStartedEventSchema = z.object({
  type: z.literal('brief.started'),
  requestId: requestIdSchema,
});

const BriefSummaryDeltaEventSchema = z.object({
  type: z.literal('brief.summary.delta'),
  requestId: requestIdSchema,
  // 增量必须非空，避免发送无意义的空 chunk
  delta: z.string().min(1),
});

const BriefCompletedEventSchema = z.object({
  type: z.literal('brief.completed'),
  requestId: requestIdSchema,
  response: AgentResponseEnvelopeSchema,
});

const BriefFailedEventSchema = z.object({
  type: z.literal('brief.failed'),
  requestId: requestIdSchema,
  error: z.object({
    // 只允许受控错误码，避免把任意内部错误码透出给前端
    code: z.enum(BRIEF_STREAM_ERROR_CODES),
    message: z.string().min(1),
  }),
});

export const BriefStreamEventSchema = z.discriminatedUnion('type', [
  BriefStartedEventSchema,
  BriefSummaryDeltaEventSchema,
  BriefCompletedEventSchema,
  BriefFailedEventSchema,
]);

/**
 * 判断一个已解析的事件是否为终态。
 *
 * 流协议 invariant：started → delta* → (completed | failed)。
 * 终态后不再有后续事件，消费方据此关闭流并清理订阅。
 *
 * 前置条件：调用方必须先通过 `BriefStreamEventSchema.parse` 校验原始事件，
 * 不要直接把未经校验的 SSE data 传入本函数。参数类型 `BriefStreamEvent`
 * 是已解析的判别联合，TS 会阻止裸 unknown 传入，但结构匹配的任意对象
 * 不会被运行时校验，可能绕过 schema 约束。
 */
export function isBriefStreamTerminalEvent(event: BriefStreamEvent): boolean {
  return event.type === 'brief.completed' || event.type === 'brief.failed';
}
