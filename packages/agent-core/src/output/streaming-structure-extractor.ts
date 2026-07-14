import { JSONParser } from '@streamparser/json';
import {
  safeForParser,
  detectMarkdownFence,
  type SurrogateBuffer,
  type FenceCheckState,
} from './chunk-safety';

/**
 * parser onValue 事件的结构类型。
 * 与 @streamparser/json 的 ParsedElementInfo 兼容，但放宽字段为可选
 * （探针验证：数组元素事件 key 为 number，stack 至少 2 层）。
 * 不直接从 @streamparser/json/utils/types/parsedElementInfo 导入：该深层子路径
 * 在 tsc moduleResolution 下解析失败，本地接口避免该依赖。
 */
interface StructureValueEvent {
  value?: unknown;
  key?: string | number;
  stack: ReadonlyArray<{ key?: string | number }>;
  partial?: boolean;
}

/**
 * 结构提取器释放的"元素就绪"信号。
 *
 * - action：actions 数组中一个元素对象完整闭合
 * - forecastStarted：futureSuggestions 区段开始（第一个元素就绪时释放一次，去重）
 * - suggestion：futureSuggestions 数组中一个元素对象完整闭合
 */
export type StructureSignal =
  | { kind: 'action'; index: number; action: Record<string, unknown> }
  | { kind: 'forecastStarted' }
  | { kind: 'suggestion'; index: number; suggestion: Record<string, unknown> };

/**
 * StreamingStructureExtractor
 *
 * 从模型流式输出的增量 JSON 文本中，释放 actions / futureSuggestions 数组元素的
 * "就绪"信号（元素对象完整闭合时）。与 StreamingSummaryExtractor 并存，runtime
 * 在 stream 分支把同一份 chunk 喂给两个提取器。
 *
 * 设计要点：
 * - 依赖 @streamparser/json 的 paths: ['$.actions.*', '$.futureSuggestions.*']，
 *   在每个数组元素（对象）闭合时触发 onValue，key 为数组 index，stack 栈顶
 *   元素 key 区分 'actions' / 'futureSuggestions'（探针验证，0.0.22）。
 * - forecastStarted 在第一个 futureSuggestions 元素就绪时释放一次（去重），
 *   紧邻其后的 suggestion 信号之前。若 LLM 不生成 futureSuggestions，不释放。
 * - 不做 ActionOptionSchema / FutureSuggestionSchema 的完整 zod 校验（终态 parser
 *   的职责）；streamparser 保证 JSON 结构合法，route 层做单元素业务校验。
 * - 复用 chunk-safety 的 surrogate + fence 守卫，与 summary 提取器行为一致。
 * - 畸形 JSON：吞错（不抛），已释放信号保留。与 summary 提取器（抛错）不同——
 *   结构提取器的错误不应中断 summary 流式（summary 提取器会单独抛错，runtime 统一处理）。
 */
export class StreamingStructureExtractor {
  /** 底层增量 JSON 解析器 */
  private readonly parser: JSONParser;

  /** 末尾落单 high surrogate 缓冲（跨 chunk 守卫 UTF-16 surrogate pair） */
  private readonly surrogateBuf: SurrogateBuffer = { tail: '' };

  /** markdown code fence 前导检测状态 */
  private readonly fenceState: FenceCheckState = { done: false, buffer: '' };

  /** 本次 push 调用累积的信号，push 结束时一次性返回（flush 时整体替换为新数组） */
  private pendingSignals: StructureSignal[] = [];

  /** forecastStarted 是否已释放（去重） */
  private forecastEmitted = false;

  /** 是否已结束（finish 调用或吞错后置 true，后续 push 不再处理） */
  private finished = false;

  constructor() {
    // paths 语法是 $.actions.* 不是 $.actions[*]（探针验证，0.0.22）
    this.parser = new JSONParser({
      paths: ['$.actions.*', '$.futureSuggestions.*'],
    });
    this.parser.onValue = (event) => this.handleValue(event);
  }

  /**
   * 喂入一个 chunk，返回本次新产生的结构信号数组。
   *
   * - markdown fence 违规：抛 MarkdownFenceError（与 summary 提取器一致；
   *   runtime 统一处理该错误类型）。
   * - 畸形 JSON：吞错（不抛），标记 finished，返回已释放信号——结构解析错误
   *   不应中断 summary 流式（summary 提取器单独的抛错会驱动 runtime 切 fallback）。
   */
  push(chunk: string): StructureSignal[] {
    if (this.finished) return [];
    if (typeof chunk !== 'string') return [];

    // fence 守卫抛 MarkdownFenceError，直接透传（与 summary 提取器行为一致）
    detectMarkdownFence(this.fenceState, chunk);

    const safeChunk = safeForParser(this.surrogateBuf, chunk);
    if (safeChunk.length > 0) {
      try {
        this.parser.write(safeChunk);
      } catch {
        // 畸形 JSON：吞错，保留已释放信号，后续 push 不再处理
        this.finished = true;
      }
    }
    return this.flush();
  }

  /**
   * 标记输入结束。本提取器吞错，finish 不抛。
   *
   * 冲刷残留 surrogate 缓冲、调用 parser.end() 均包裹 try/catch——
   * 结构提取器的设计原则是"绝不让结构解析错误中断 summary 流式"。
   */
  finish(): void {
    this.finished = true;
    if (this.surrogateBuf.tail.length > 0) {
      try {
        this.parser.write(this.surrogateBuf.tail);
      } catch {
        // 吞错
      }
      this.surrogateBuf.tail = '';
    }
    try {
      this.parser.end();
    } catch {
      // 吞错：streamparser end() 的怪癖（"state: ENDED"）或截断，都不中断结构流
    }
  }

  /**
   * 处理 parser 的 onValue 事件。
   *
   * stack 栈顶元素 key 标识父数组（探针验证）：
   * - 'actions'：释放 action 信号
   * - 'futureSuggestions'：首次先释放 forecastStarted（去重），再释放 suggestion 信号
   */
  private handleValue(event: StructureValueEvent): void {
    const { value, key, stack } = event;
    // 对象元素不支持 emitPartialValues，只在完整闭合时触发；过滤 partial 事件
    if (value === undefined || typeof key !== 'number') return;
    // stack 栈顶元素 key 标识父数组（探针验证：actions / futureSuggestions）
    const top = stack.length >= 2 ? stack[stack.length - 1] : undefined;
    const parentKey = top?.key;
    if (parentKey === 'futureSuggestions') {
      // 第一次见到 futureSuggestions 元素：先发 forecastStarted
      if (!this.forecastEmitted) {
        this.forecastEmitted = true;
        this.pendingSignals.push({ kind: 'forecastStarted' });
      }
      this.pendingSignals.push({
        kind: 'suggestion',
        index: key,
        suggestion: value as Record<string, unknown>,
      });
    } else if (parentKey === 'actions') {
      this.pendingSignals.push({
        kind: 'action',
        index: key,
        action: value as Record<string, unknown>,
      });
    }
  }

  /** 取出本次累积的信号，重置缓冲为全新数组（保持不可变：返回的快照与后续状态隔离） */
  private flush(): StructureSignal[] {
    if (this.pendingSignals.length === 0) return [];
    const out = this.pendingSignals;
    this.pendingSignals = [];
    return out;
  }
}
