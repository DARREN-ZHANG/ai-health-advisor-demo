import { describe, it, expect } from 'vitest';
import { safeForParser, detectMarkdownFence, MarkdownFenceError } from '../chunk-safety';

describe('safeForParser', () => {
  it('完整码元原样返回', () => {
    const buf = { tail: '' };
    expect(safeForParser(buf, 'abc')).toBe('abc');
    expect(buf.tail).toBe('');
  });
  it('末尾落单 high surrogate 暂存', () => {
    const buf = { tail: '' };
    // "𝄞" = U+1D11E = surrogate pair \uD834\uDD1E
    const safe = safeForParser(buf, 'a\uD834');
    expect(safe).toBe('a');
    expect(buf.tail).toBe('\uD834');
  });
  it('下个 chunk 拼回 surrogate', () => {
    const buf = { tail: '\uD834' };
    expect(safeForParser(buf, '\uDD1Eb')).toBe('\uD834\uDD1Eb');
    expect(buf.tail).toBe('');
  });
});

describe('detectMarkdownFence', () => {
  it('合法 JSON 起始不抛', () => {
    const st = { done: false, buffer: '' };
    expect(() => detectMarkdownFence(st, '{')).not.toThrow();
    expect(st.done).toBe(true);
  });
  it('前导空白后反引号抛 MarkdownFenceError', () => {
    const st = { done: false, buffer: '' };
    expect(() => detectMarkdownFence(st, '  \n```')).toThrow(MarkdownFenceError);
  });
  it('跨 chunk 的前导空白 + 反引号', () => {
    const st = { done: false, buffer: '' };
    detectMarkdownFence(st, '  ');
    expect(st.done).toBe(false);
    expect(() => detectMarkdownFence(st, '\n`')).toThrow(MarkdownFenceError);
  });
  it('done 后不再检测', () => {
    const st = { done: true, buffer: '' };
    expect(() => detectMarkdownFence(st, '```')).not.toThrow();
  });
});
