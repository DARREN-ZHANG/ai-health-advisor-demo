import type { AgentResponseEnvelope } from './agent';

/**
 * 首页实时简报的 SSE 事件契约。
 *
 * 设计意图：前端 (apps/web) 与后端 (apps/agent-api) 通过这套
 * discriminated union 序列化/校验流事件，避免两端各写一份易漂移的解析逻辑。
 *
 * 安全约束：事件字段本身不承载 provider 原始错误、API key、
 * base URL 或 prompt —— schema 只声明可对外暴露的字段，
 * 消费方拿到的结构天然不含敏感数据。
 */
export interface BriefStartedEvent {
  type: 'brief.started';
  requestId: string;
}

export interface BriefSummaryDeltaEvent {
  type: 'brief.summary.delta';
  requestId: string;
  /** 增量文本片段，必须是非空字符串，空 delta 在 schema 层被拒绝 */
  delta: string;
}

export interface BriefCompletedEvent {
  type: 'brief.completed';
  requestId: string;
  /** 终态响应信封，结构必须通过 AgentResponseEnvelopeSchema 校验 */
  response: AgentResponseEnvelope;
}

/**
 * 失败事件允许的错误码 —— 单点定义，schema 的 z.enum 直接消费此常量，
 * 避免双处写字符串字面量造成漂移（micro-event 的 MICRO_EVENT_TYPES 同模式）。
 */
export const BRIEF_STREAM_ERROR_CODES = [
  'BRIEF_GENERATION_FAILED',
  'STREAM_ABORTED',
] as const;

export type BriefStreamErrorCode = (typeof BRIEF_STREAM_ERROR_CODES)[number];

export interface BriefFailedEvent {
  type: 'brief.failed';
  requestId: string;
  error: {
    code: BriefStreamErrorCode;
    message: string;
  };
}

/**
 * 流事件的判别联合：以 `type` 作为判别字段。
 * started → 可选多次 summary.delta → completed | failed (终态二选一)。
 */
export type BriefStreamEvent =
  | BriefStartedEvent
  | BriefSummaryDeltaEvent
  | BriefCompletedEvent
  | BriefFailedEvent;
