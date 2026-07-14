/**
 * chunk-safety：跨提取器共享的 LLM chunk 预处理守卫。
 *
 * 两个守卫（原先散落在 StreamingSummaryExtractor 内部）：
 * - safeForParser：缓冲末尾落单 high surrogate，避免 @streamparser/json 0.0.22
 *   在 chunk 边界切断 UTF-16 surrogate pair 时产生乱码。
 * - detectMarkdownFence：检测模型用 ```json fence 包裹 JSON 的违规，前导空白
 *   可能跨 chunk，需缓冲直到遇到第一个实质字符。
 *
 * 抽到独立 helper 的理由：StreamingStructureExtractor 与 StreamingSummaryExtractor
 * 各自解析同一份 chunk 流，两份守卫必须行为一致，集中维护避免漂移。
 */

export interface SurrogateBuffer {
  /** 落单 high surrogate 暂存区 */
  tail: string;
}

export interface FenceCheckState {
  /** 是否已完成前导检测 */
  done: boolean;
  /** 前导空白缓冲 */
  buffer: string;
}

export class MarkdownFenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarkdownFenceError';
    Object.setPrototypeOf(this, MarkdownFenceError.prototype);
  }
}

/**
 * 确保 chunk 不在 UTF-16 surrogate pair 中间断开。
 * 读取并清空 buf.tail，返回可安全交给 parser 的字符串，可能把新的落单 high
 * surrogate 写回 buf.tail。
 */
export function safeForParser(buf: SurrogateBuffer, chunk: string): string {
  const combined = buf.tail + chunk;
  buf.tail = '';
  if (combined.length === 0) return '';
  const lastCharCode = combined.charCodeAt(combined.length - 1);
  if (lastCharCode >= 0xd800 && lastCharCode <= 0xdbff) {
    buf.tail = combined.charAt(combined.length - 1);
    return combined.slice(0, -1);
  }
  return combined;
}

/**
 * 检测 markdown code fence。前导空白（空格/\t/\n/\r）可能跨 chunk，缓冲直到
 * 遇到第一个非空白字符；若该字符是反引号，抛 MarkdownFenceError。
 * st.done=true 后直接返回（检测已完成）。
 */
export function detectMarkdownFence(st: FenceCheckState, chunk: string): void {
  if (st.done) return;
  st.buffer += chunk;
  const buf = st.buffer;
  for (let i = 0; i < buf.length; i++) {
    const ch = buf.charAt(i);
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') continue;
    st.done = true;
    if (ch === '`') {
      throw new MarkdownFenceError('输入以 markdown code fence（```）开头，期望纯 JSON 流');
    }
    st.buffer = '';
    return;
  }
  if (st.buffer.length > 64) {
    throw new MarkdownFenceError('前导空白过长（>64 字符），疑似异常输入');
  }
}
