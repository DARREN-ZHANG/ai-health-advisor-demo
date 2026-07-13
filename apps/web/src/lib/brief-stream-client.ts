/**
 * 首页实时简报的 SSE 流式消费 client。
 *
 * 为什么用 fetch 而不是 EventSource:
 * - 请求需要 POST body(EventSource 只支持 GET)
 * - 需要自定义 X-Session-Id / X-Lang 头(EventSource 不支持自定义头)
 * - 需要支持外部 AbortSignal 取消(EventSource 的 abort 是 close,无法提前注入)
 * - 需要从 response headers 提取 X-Session-Id 并缓存
 *
 * 状态机规则(严格,不做 retry/reconnect):
 * - brief.started (requestId 匹配):记录开始
 * - brief.summary.delta (requestId 匹配):回调 onEvent
 * - brief.completed (requestId 匹配):回调 onEvent,resolve(response),标记 terminalReceived
 * - brief.failed (requestId 匹配):回调 onEvent,reject(BriefStreamError),标记 terminalReceived
 * - 任意 event 的 requestId 与 options.requestId 不一致 → reject(STREAM_REQUEST_ID_MISMATCH)
 * - terminal 之后再收到任何 event → reject(STREAM_UNEXPECTED_EVENT_AFTER_TERMINAL)
 * - EOF 但未收到 terminal → reject(STREAM_EOF_WITHOUT_TERMINAL)
 * - HTTP 非 2xx → 读 JSON error,reject
 * - AbortSignal aborted → 透传 AbortError(不重试)
 * - 未知 event type / schema 校验失败 → reject(STREAM_INVALID_EVENT)
 *
 * @see packages/shared/src/schemas/brief-stream.ts 事件契约
 */
import { createParser, type EventSourceMessage } from 'eventsource-parser';
import {
  BriefStreamEventSchema,
  type AgentResponseEnvelope,
  type BriefStreamEvent,
  type PageContext,
} from '@health-advisor/shared';
import { ApiError, buildApiHeaders, createApiUrl, setSessionId } from './api-client';

/** morning brief 请求体;从现有 useMorningBrief/useRefetchBrief 调用结构提取 */
export interface MorningBriefRequest {
  profileId: string;
  pageContext: PageContext;
  /** 强制绕过后端缓存(刷新按钮场景) */
  bustCache?: boolean;
}

/** client 调用选项 */
export interface StreamMorningBriefOptions {
  /** 当前流的唯一标识,用于校验入站事件的 requestId 一致性 */
  requestId: string;
  /** 外部取消信号(React Query 自动管理);aborted 时透传 AbortError */
  signal: AbortSignal;
  /** 每个合法 SSE 事件的回调,由消费方(store/hook)累积 delta */
  onEvent(event: BriefStreamEvent): void;
}

/**
 * client 私有的协议违规错误码,供消费方 UI 区分展示。
 *
 * 命名刻意区分于 shared 的 BriefStreamErrorCode:
 * - shared 的 BriefStreamErrorCode 仅约束 brief.failed 事件的 error.code 字段,
 *   由 BriefStreamEventSchema 强制,取值 'BRIEF_GENERATION_FAILED' | 'STREAM_ABORTED'。
 * - 这里的 BriefStreamClientErrorCode 是 client 侧协议违规码集合,除透传后端
 *   failed/HTTP code 外还包含本地违规(STREAM_INVALID_EVENT 等)。两者同名但语义不同,
 *   命名加 Client 后缀避免维护者混淆。
 */
export type BriefStreamClientErrorCode =
  | 'STREAM_INVALID_EVENT'
  | 'STREAM_REQUEST_ID_MISMATCH'
  | 'STREAM_UNEXPECTED_EVENT_AFTER_TERMINAL'
  | 'STREAM_EOF_WITHOUT_TERMINAL'
  | 'STREAM_NO_BODY'
  // 后端 brief.failed 透传的 code
  | 'BRIEF_GENERATION_FAILED'
  | 'STREAM_ABORTED'
  // HTTP 非 2xx 时透传后端 error.code,兜底值
  | (string & {});

/**
 * 流式消费错误。
 *
 * 继承 ApiError 以统一参数顺序为 (status, code, message),消除两个类之间的
 * 形状兼容但构造器不兼容陷阱;同时让 catch 里 instanceof ApiError 也能命中
 * 流式错误,便于上层 hook(任务 3.2)统一处理。
 *
 * 注意:brief.failed 事件的 error.code 仍由 shared 的 BriefStreamErrorCode
 * 约束,client 把它透传进 BriefStreamClientErrorCode 的联合兜底分支。
 */
export class BriefStreamError extends ApiError {
  constructor(
    /** HTTP 非 2xx 时为响应状态码;协议违规/EOF 时为 0 */
    status: number,
    code: BriefStreamClientErrorCode,
    message: string,
  ) {
    super(status, code, message);
    // 覆盖父类 name,便于 instanceof BriefStreamError 精确分类
    this.name = 'BriefStreamError';
  }
}

/** SSE 路径常量,避免字面量散落 */
const MORNING_BRIEF_STREAM_PATH = '/ai/morning-brief/stream';

/**
 * 消费首页 morning brief 的 SSE 流。
 *
 * @returns Promise 在 brief.completed 时 resolve 完整 envelope;
 *   任何协议违规、HTTP 错误、failed 终态、EOF 无 terminal 都会 reject。
 *   AbortSignal aborted 时透传原生 AbortError(不包装),以便 React Query 识别。
 */
export async function streamMorningBrief(
  payload: MorningBriefRequest,
  options: StreamMorningBriefOptions,
): Promise<AgentResponseEnvelope> {
  const { requestId, signal, onEvent } = options;

  const url = createApiUrl(MORNING_BRIEF_STREAM_PATH);
  const body = JSON.stringify(payload);
  const headers = buildApiHeaders(undefined, body);

  // 关键:fetch 的 signal 直接透传;aborted 时 fetch 抛 AbortError,这里不 catch,
  // 让其原样向上抛(React Query 据此区分取消与失败)。
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal,
  });

  // HTTP 非 2xx:尝试解析 JSON error body(reject),解析失败兜底 UNKNOWN_HTTP_ERROR
  if (!response.ok) {
    throw await buildHttpError(response);
  }

  // 收到 2xx 后立即提取并缓存 session-id(与普通 request 行为一致)
  const responseSessionId = response.headers.get('X-Session-Id');
  if (responseSessionId) {
    setSessionId(responseSessionId);
  }

  if (!response.body) {
    throw new BriefStreamError(
      response.status,
      'STREAM_NO_BODY',
      '流式响应缺少 body',
    );
  }

  // 通过 reader + TextDecoder 增量解码,eventsource-parser 累积解析 SSE 帧。
  // 任意 chunk 边界都由 parser.feed 内部处理。
  return consumeStream(response.body, requestId, onEvent);
}

/**
 * 读取 ReadableStream 并按 SSE 协议消费事件,严格执行状态机。
 *
 * 设计:同步累积状态(terminal/event/error),整流读完后统一判断终态。
 * 不使用 Promise executor + 异步 reject 的模式,以避免"已 resolved 后再 reject"
 * 的死锁——同一 chunk 内可能含 terminal + 其后的事件,必须全部解析后才能决定。
 *
 * 抽成内部函数便于单文件内复用与关注点分离(streamMorningBrief 只负责
 * HTTP 握手与 session-id,consumeStream 专注 SSE 协议解析)。
 */
async function consumeStream(
  stream: ReadableStream<Uint8Array>,
  requestId: string,
  onEvent: (event: BriefStreamEvent) => void,
): Promise<AgentResponseEnvelope> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();

  // terminal 已到达?其后任何 event 都视为协议违规
  let terminalReceived = false;
  // 终态成功响应(completed 时填充)
  let resolvedEnvelope: AgentResponseEnvelope | null = null;
  // 终态失败错误(schema 拒绝/mismatch/failed/EOF 等任意违规)
  let rejectionError: BriefStreamError | null = null;

  function reject(error: BriefStreamError) {
    // 失败优先:一旦记录 rejection,后续 resolve 被忽略
    if (rejectionError === null) {
      rejectionError = error;
    }
  }

  const parser = createParser({
    onEvent: (sseMessage: EventSourceMessage) => {
      // 已经有 rejection,后续事件忽略(避免覆盖首个错误)
      if (rejectionError !== null) return;

      const parsedEvent = parseAndValidate(sseMessage, requestId);
      if (parsedEvent instanceof BriefStreamError) {
        reject(parsedEvent);
        return;
      }

      // terminal 之后再收到 event → 协议违规
      if (terminalReceived) {
        reject(
          new BriefStreamError(
            0,
            'STREAM_UNEXPECTED_EVENT_AFTER_TERMINAL',
            `terminal 之后收到额外事件: ${parsedEvent.type}`,
          ),
        );
        return;
      }

      onEvent(parsedEvent);

      // 显式按 type 分支,让 TS 正确 narrow discriminated union;
      // 不依赖 isBriefStreamTerminalEvent(它是普通函数,无法做 typeguard)
      if (parsedEvent.type === 'brief.completed') {
        terminalReceived = true;
        // 仅当尚未被 reject 时记录成功(reject 优先)
        if (rejectionError === null) {
          resolvedEnvelope = parsedEvent.response;
        }
      } else if (parsedEvent.type === 'brief.failed') {
        terminalReceived = true;
        reject(
          new BriefStreamError(
            0,
            parsedEvent.error.code,
            parsedEvent.error.message,
          ),
        );
      }
    },
  });

  try {
    // 读流循环:每个 chunk 喂给 parser,parser 触发 onEvent 回调
    // 关键:不要在 settled 时提前 break —— 同一 chunk 内可能还有 terminal 后事件,
    // 必须让 parser 全部处理完才能发现"terminal 后事件"违规。
    //
    // 但 rejection 已在上一轮 chunk 处理后确认:此时不再有"同 chunk 内后续事件"
    // 需要观察,直接 cancel 并 break,避免读完整个长流浪费带宽与 CPU。
    while (true) {
      if (rejectionError !== null) {
        // .catch 兜底:cancel 本身可能抛(流已结束/reader 已释放),忽略即可
        await reader.cancel().catch(() => {});
        break;
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        parser.feed(decoder.decode(value, { stream: true }));
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // 已释放则忽略
    }
  }

  // 终态判定:rejection 优先,其次 completed,最后 EOF 无 terminal
  if (rejectionError !== null) {
    throw rejectionError;
  }
  if (resolvedEnvelope !== null) {
    return resolvedEnvelope;
  }
  // 流读完但既无 rejection 也无 envelope → EOF 无 terminal
  throw new BriefStreamError(
    0,
    'STREAM_EOF_WITHOUT_TERMINAL',
    '流结束前未收到 terminal 事件',
  );
}

/**
 * 解析 SSE event 的 data 字段为 BriefStreamEvent 并校验 requestId 一致性。
 *
 * @returns 合法事件,或 BriefStreamError(供调用方 fail);不抛异常以保持回调链可控。
 */
function parseAndValidate(
  sseMessage: EventSourceMessage,
  expectedRequestId: string,
): BriefStreamEvent | BriefStreamError {
  let parsed: unknown;
  try {
    parsed = JSON.parse(sseMessage.data);
  } catch {
    return new BriefStreamError(
      0,
      'STREAM_INVALID_EVENT',
      `SSE data 非合法 JSON: ${truncate(sseMessage.data)}`,
    );
  }

  const result = BriefStreamEventSchema.safeParse(parsed);
  if (!result.success) {
    return new BriefStreamError(
      0,
      'STREAM_INVALID_EVENT',
      `SSE 事件未通过 schema 校验: ${result.error.message}`,
    );
  }

  const event = result.data;
  if (event.requestId !== expectedRequestId) {
    return new BriefStreamError(
      0,
      'STREAM_REQUEST_ID_MISMATCH',
      `事件 requestId "${event.requestId}" 与期望 "${expectedRequestId}" 不一致`,
    );
  }

  return event;
}

/** 从 HTTP 非 2xx response 构造 BriefStreamError,尽量解析后端 error body */
async function buildHttpError(response: Response): Promise<BriefStreamError> {
  let code = 'UNKNOWN_HTTP_ERROR';
  let message = `流式请求失败,状态码 ${response.status}`;

  try {
    const errorData = (await response.json()) as {
      error?: { code?: string; message?: string };
    };
    if (errorData?.error?.code) {
      code = errorData.error.code;
    }
    if (errorData?.error?.message) {
      message = errorData.error.message;
    }
  } catch {
    // JSON 解析失败,保留兜底 code/message
  }

  return new BriefStreamError(response.status, code, message);
}

/** 截断超长字符串,避免错误信息把整段 SSE data 打进日志/堆栈 */
function truncate(s: string, max = 120): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}
