import { JSONParser } from '@streamparser/json';
import {
  safeForParser,
  detectMarkdownFence,
  MarkdownFenceError,
  type SurrogateBuffer,
  type FenceCheckState,
} from './chunk-safety';

/**
 * parser onValue 事件的结构类型。
 * 与 @streamparser/json 的 ParsedElementInfo 兼容，但放宽 key 类型为 string | number
 * （数组元素的事件 key 为 number）。
 */
interface SummaryValueEvent {
  value?: unknown;
  key?: string | number;
  partial?: boolean;
}

/**
 * StreamingSummaryParseError
 *
 * 提取器遇到协议违规时抛出的类型化错误。
 * runtime 可通过 instanceof 精确捕获，与其它解析异常区分。
 */
export class StreamingSummaryParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StreamingSummaryParseError';
    // 维持原型链（TS 编译到 ES5 以下时 subclass 的 instance 检测会失真）
    Object.setPrototypeOf(this, StreamingSummaryParseError.prototype);
  }
}

/**
 * StreamingSummaryExtractor
 *
 * 从模型流式输出的增量 JSON 文本中，只释放 `$.summary` 字段的文本增量（delta）。
 *
 * 设计要点：
 * - 依赖 @streamparser/json 的增量解析能力，配置
 *   `{ paths: ['$.summary'], emitPartialTokens: true, emitPartialValues: true }`。
 * - parser 释放的 partial value 是"到目前为止该字段已解析的完整前缀"。
 *   提取器缓存上一次释放值，只返回新增 suffix 作为 delta。
 * - 完整 raw JSON 留给上层（调用方累积原始 chunk），由现有 parseAgentResponse 做终态校验；
 *   本提取器只负责实时 summary delta。
 *
 * 协议违规（均抛出 StreamingSummaryParseError）：
 * - 新 partial value 不是 previousValue 的前缀（数据异常，parser 状态不一致）
 * - summary 字段出现两次（重复 key）
 * - summary 字段值不是 string 类型
 * - 流提前结束（finish 时 JSON 未完整结束或从未出现 summary）
 * - 输入以 markdown code fence（```）开头（模型用 fence 包裹 JSON，违反纯 JSON 契约）
 *
 * streamparser 0.0.22 行为备忘（通过探针验证）：
 * - 即使 JSON 完整，parser.end() 也会抛 "state: ENDED" 错误——这是库的已知怪癖，
 *   不能用它判定截断。本提取器用 `state: ENDED` 区分正常结束与真正的截断。
 * - 配置 emitPartialTokens:true 时，parser 会对 paths 之外的字段名释放
 *   value===undefined 的事件；必须用 `key === 'summary' && value !== undefined` 过滤。
 * - parser 不会检测重复 key、不会校验 summary 类型，需要提取器自行处理。
 */
export class StreamingSummaryExtractor {
  /** 底层增量 JSON 解析器 */
  private readonly parser: JSONParser;

  /** 上一次释放的 partial summary value，用于计算 suffix 增量 */
  private previousValue = '';

  /** 本次 push 调用累积的 delta，push 结束时一次性返回 */
  private pendingDeltas: string[] = [];

  /** 是否已收到 summary 的 final value（partial === false） */
  private summaryFinalReceived = false;

  /** 是否已调用 finish，防止重复使用 */
  private finished = false;

  /**
   * 末尾落单 high surrogate 缓冲。
   *
   * 背景：@streamparser/json 0.0.22 在 chunk 边界切断 UTF-16 surrogate pair 时
   * 会产生乱码——它把单独的 high surrogate 当成完整字符释放为 partial value，
   * 后续 low surrogate 到达后值无法对齐。模型 chunk 边界不可控，必须在喂入
   * parser 前确保不把 surrogate pair 拆开。
   *
   * 守卫逻辑由 chunk-safety.ts 的 safeForParser 维护，集中到独立 helper 后
   * StreamingStructureExtractor 复用同一份实现避免漂移。
   */
  private readonly surrogateBuf: SurrogateBuffer = { tail: '' };

  /**
   * markdown code fence 前导检测状态。
   *
   * 模型有时用 ```json ... ``` 包裹 JSON，违反纯 JSON 流契约。为支持合法 JSON
   * 的前导空白（可能跨 chunk），需缓冲直到遇到第一个实质字符再判定。
   * 守卫逻辑由 chunk-safety.ts 的 detectMarkdownFence 维护。
   */
  private readonly fenceState: FenceCheckState = { done: false, buffer: '' };

  constructor() {
    this.parser = new JSONParser({
      paths: ['$.summary'],
      emitPartialTokens: true,
      emitPartialValues: true,
    });

    this.parser.onValue = (event) => {
      this.handleValueEvent(event);
    };
  }

  /**
   * 喂入一个模型 chunk（string），返回本次新产生的 delta 数组。
   * 不推进 summary 解析时返回空数组 []。
   */
  push(chunk: string): string[] {
    if (this.finished) {
      throw new StreamingSummaryParseError(
        'extractor 已 finish，不能再 push 新 chunk',
      );
    }
    if (typeof chunk !== 'string') {
      throw new StreamingSummaryParseError(
        `push 只接受 string chunk，收到 ${typeof chunk}`,
      );
    }

    // 入口检测 markdown code fence：
    // 模型有时用 ```json ... ``` 包裹 JSON，这违反纯 JSON 流契约。
    // 我们不在运行时 strip（plan 明确要求不接受 fence），而是直接作为错误抛出。
    // 为支持合法的 JSON 前导空白，先消耗前导空白再判断。
    // 守卫逻辑在 chunk-safety.ts，抛 MarkdownFenceError；这里转成
    // StreamingSummaryParseError 以保持对外 instanceof 契约（runtime 依赖它区分错误）。
    try {
      detectMarkdownFence(this.fenceState, chunk);
    } catch (err) {
      if (err instanceof MarkdownFenceError) {
        throw new StreamingSummaryParseError(err.message);
      }
      throw err;
    }

    // surrogate pair 安全缓冲：确保不把 UTF-16 surrogate pair 拆开交给 parser。
    // @streamparser/json 0.0.22 在 chunk 边界切断 surrogate pair 会产生乱码。
    const safeChunk = safeForParser(this.surrogateBuf, chunk);

    // parser.write 可能同步抛错（例如非法 JSON 字符），统一转成 typed error
    if (safeChunk.length > 0) {
      try {
        this.parser.write(safeChunk);
      } catch (err) {
        throw this.toTypedError(err);
      }
    }

    // 取出本次 push 累积的 delta，重置缓冲
    const deltas = this.pendingDeltas;
    this.pendingDeltas = [];
    return deltas;
  }

  /**
   * 标记输入结束。
   *
   * 若 JSON 未完整结束（parser 仍在等待 token）或从未出现 summary 字段，
   * 抛出 StreamingSummaryParseError。
   *
   * 注意：streamparser 0.0.22 的 end() 即使在 JSON 完整时也会抛
   * "state: ENDED" 错误——这是库的已知行为，不能作为截断判据。
   * 本方法用是否收到过 summary final value 作为成功完成的判据。
   */
  finish(): void {
    if (this.finished) {
      throw new StreamingSummaryParseError('extractor 已 finish，不能重复调用');
    }
    this.finished = true;

    // 冲刷残留的 surrogate 缓冲：流结束时若仍有落单 high surrogate，
    // 说明 JSON 中存在非法的单独 surrogate 字符，交给 parser 处理（会抛错）。
    if (this.surrogateBuf.tail.length > 0) {
      try {
        this.parser.write(this.surrogateBuf.tail);
      } catch (err) {
        throw this.toTypedError(err);
      }
      this.surrogateBuf.tail = '';
    }

    // 调用 end() 让 parser 进行最终状态检查。
    // 完整 JSON 会抛 "state: ENDED"（库怪癖），截断 JSON 会抛其他 state。
    try {
      this.parser.end();
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      // "state: ENDED" 表示 parser 正常消费完所有输入（库的怪癖，非错误）
      // 其他 state（如 STRING_DEFAULT、OBJECT_KEY 等）表示真正的截断
      if (!msg.includes('state: ENDED')) {
        throw new StreamingSummaryParseError(
          `JSON 流未完整结束：${msg}`,
        );
      }
    }

    // 即使 end() 通过（或抛 ENDED），也必须校验是否真的解析到了 summary
    if (!this.summaryFinalReceived) {
      throw new StreamingSummaryParseError(
        'JSON 流结束但未收到 summary 字段的完整值（字段缺失或输入截断）',
      );
    }
  }

  /**
   * 处理 parser 的 onValue 事件。
   * 只关注 key === 'summary' 且 value !== undefined 的事件
   * （emitPartialTokens:true 会对其它字段名释放 value===undefined 事件，需过滤）。
   */
  private handleValueEvent(event: SummaryValueEvent): void {
    const { value, key, partial } = event;

    // 过滤非 summary 字段事件（paths 不完全屏蔽，需手动判断）
    if (key !== 'summary' || value === undefined) {
      return;
    }

    // 重复 summary key 检测：
    // 第一次见到 final value 后，若再次见到 summary 事件，视为重复 key。
    // （partial 事件不触发，因为同一字符串解析期间会多次释放 partial）
    if (this.summaryFinalReceived) {
      throw new StreamingSummaryParseError(
        'JSON 中出现重复的 summary 字段',
      );
    }

    // 类型校验：summary 必须是 string
    if (typeof value !== 'string') {
      throw new StreamingSummaryParseError(
        `summary 字段必须是 string，收到 ${typeof value}`,
      );
    }

    // 增量校验：新 partial value 必须以 previousValue 为前缀。
    // parser 释放的 partial 是"到目前为止的完整前缀"，因此
    // 正常情况下 newValue.startsWith(previousValue) 必然成立。
    if (!value.startsWith(this.previousValue)) {
      throw new StreamingSummaryParseError(
        `summary partial value 不再是旧值的前缀，parser 状态异常（旧值长度=${this.previousValue.length}，新值长度=${value.length}）`,
      );
    }

    // 计算 suffix 增量
    const delta = value.slice(this.previousValue.length);
    this.previousValue = value;

    if (delta.length > 0) {
      this.pendingDeltas.push(delta);
    }

    // partial === false（或 undefined）表示该值已完整解析
    // 注意：探针显示 final value 事件没有 partial 字段（undefined），partial===true 才是增量
    if (!partial) {
      this.summaryFinalReceived = true;
    }
  }

  /**
   * 把 parser.write 抛出的底层错误转成 typed error。
   * 已是 StreamingSummaryParseError 的原样透传。
   */
  private toTypedError(err: unknown): StreamingSummaryParseError {
    if (err instanceof StreamingSummaryParseError) {
      return err;
    }
    const msg = (err as Error)?.message ?? String(err);
    return new StreamingSummaryParseError(`JSON 解析错误：${msg}`);
  }
}
