import { describe, it, expect } from 'vitest';
import {
  StreamingSummaryExtractor,
  StreamingSummaryParseError,
} from '../streaming-summary-extractor';

// 辅助：逐字符喂入，收集所有 delta 拼接结果
function feedCharByChar(json: string, opts?: { allowTruncatedFinish?: boolean }) {
  const extractor = new StreamingSummaryExtractor();
  const deltas: string[] = [];
  for (const ch of json) {
    deltas.push(...extractor.push(ch));
  }
  extractor.finish();
  return { deltas, joined: deltas.join(''), extractor };
}

// 辅助：确定性伪随机种子切分 JSON
// 使用 LCG（线性同余生成器），保证同一种子产生同一切分序列
function splitWithSeed(json: string, seed: number, minChunk = 1, maxChunk = 7): string[] {
  const chunks: string[] = [];
  let state = seed >>> 0 || 1;
  let i = 0;
  while (i < json.length) {
    // LCG 推进
    state = (state * 1103515245 + 12345) >>> 0;
    const range = maxChunk - minChunk + 1;
    const size = minChunk + (state % range);
    chunks.push(json.slice(i, i + size));
    i += size;
  }
  return chunks;
}

function feedChunks(chunks: string[]) {
  const extractor = new StreamingSummaryExtractor();
  const deltas: string[] = [];
  for (const chunk of chunks) {
    deltas.push(...extractor.push(chunk));
  }
  extractor.finish();
  return { deltas, joined: deltas.join(''), extractor };
}

describe('StreamingSummaryExtractor - 基础增量解析', () => {
  it('逐字符喂入 summary 作为首字段时，delta 拼接等于最终 summary', () => {
    const json = '{"summary":"你好世界","actions":[]}';
    const { joined } = feedCharByChar(json);
    expect(joined).toBe('你好世界');
  });

  it('逐字符喂入空 summary 字符串', () => {
    const json = '{"summary":"","actions":[]}';
    const { joined, deltas } = feedCharByChar(json);
    // 空字符串：不应产生任何 delta，但应正常完成
    expect(joined).toBe('');
    expect(deltas).toEqual([]);
  });

  it('大块写入也能正确提取 summary', () => {
    const json = '{"summary":"完整块写入测试","actions":[1,2,3]}';
    const extractor = new StreamingSummaryExtractor();
    const deltas: string[] = [];
    deltas.push(...extractor.push(json));
    extractor.finish();
    expect(deltas.join('')).toBe('完整块写入测试');
  });
});

describe('StreamingSummaryExtractor - summary 非首字段', () => {
  it('summary 在 actions 之后仍能被 paths 定位', () => {
    const json = '{"actions":[{"type":"alert"}],"summary":"后置字段","meta":{"k":1}}';
    const { joined } = feedCharByChar(json);
    expect(joined).toBe('后置字段');
  });

  it('summary 在中间字段，逐字符与块写入结果一致', () => {
    const json = '{"a":[1,2,3],"summary":"中间","b":{"c":true}}';
    const byChar = feedCharByChar(json).joined;
    const byBlock = feedChunks([json]).joined;
    expect(byChar).toBe('中间');
    expect(byBlock).toBe('中间');
  });
});

describe('StreamingSummaryExtractor - 随机固定种子切分', () => {
  const cases = [
    { seed: 1, json: '{"summary":"确定性切分测试","actions":[]}' },
    { seed: 42, json: '{"summary":"另一个种子","meta":{"x":1}}' },
    { seed: 100, json: '{"actions":[1],"summary":"种子100","b":2}' },
    { seed: 2024, json: '{"summary":"较长内容用于测试各种切分边界的行为是否稳定一致","actions":[1,2,3]}' },
  ];

  for (const { seed, json } of cases) {
    it(`种子 ${seed} 下 delta 拼接等于 summary`, () => {
      const expected = JSON.parse(json).summary as string;
      const chunks = splitWithSeed(json, seed);
      // 确保切分确实产生了多个 chunk（否则测试退化）
      expect(chunks.length).toBeGreaterThan(1);
      const { joined } = feedChunks(chunks);
      expect(joined).toBe(expected);
    });
  }

  it('多种子切分结果一致且等于逐字符结果', () => {
    const json = '{"summary":"跨种子一致性验证文本","actions":[]}';
    const expected = '跨种子一致性验证文本';
    const byChar = feedCharByChar(json).joined;
    expect(byChar).toBe(expected);
    for (const seed of [1, 2, 3, 7, 99, 500]) {
      const { joined } = feedChunks(splitWithSeed(json, seed));
      expect(joined).toBe(expected);
    }
  });
});

describe('StreamingSummaryExtractor - 转义字符边界', () => {
  it('escaped quote：summary 含 \\"，逐字符切分不会在转义中间断开', () => {
    // JSON 中表示为 \"，解析后值含一个双引号字符
    const json = '{"summary":"含\\"引号的内容"}';
    const { joined } = feedCharByChar(json);
    expect(joined).toBe('含"引号的内容');
  });

  it('backslash：summary 含 \\\\，解析后为单个反斜杠', () => {
    // JSON 中 \\ 解析为单个 \
    const json = '{"summary":"反\\\\斜杠"}';
    const { joined } = feedCharByChar(json);
    expect(joined).toBe('反\\斜杠');
  });

  it('混合转义：\\" \\\\ \\n \\t', () => {
    // 值应为：a"\b<cRLF><TAB>
    const json = '{"summary":"a\\"b\\\\c\\n\\t"}';
    const { joined } = feedCharByChar(json);
    expect(joined).toBe('a"b\\c\n\t');
  });

  it('转义字符跨 chunk 边界（强制在反斜杠处切分）', () => {
    // 构造一个 JSON，其中转义序列恰好在 chunk 边界
    // 值："ab"cd，JSON 表示为 "ab\"cd
    const json = '{"summary":"ab\\"cd"}';
    // 手工切分让 \ 和 " 分属不同 chunk
    const extractor = new StreamingSummaryExtractor();
    const deltas: string[] = [];
    // 喂到 \ 之前
    deltas.push(...extractor.push('{"summary":"ab'));
    deltas.push(...extractor.push('\\'));
    deltas.push(...extractor.push('"'));
    deltas.push(...extractor.push('cd"}'));
    extractor.finish();
    expect(deltas.join('')).toBe('ab"cd');
  });
});

describe('StreamingSummaryExtractor - 换行与 Unicode', () => {
  it('summary 含 \\n\\n 换行', () => {
    const json = '{"summary":"第一段\\n\\n第二段"}';
    const { joined } = feedCharByChar(json);
    expect(joined).toBe('第一段\n\n第二段');
  });

  it('emoji：summary 含 📈', () => {
    const json = '{"summary":"上升 📈 趋势"}';
    const { joined } = feedCharByChar(json);
    expect(joined).toBe('上升 📈 趋势');
  });

  it('emoji ZWJ 组合 👨‍💻 跨 chunk 边界', () => {
    const value = '工程师 👨‍💻 加油';
    const json = JSON.stringify({ summary: value, actions: [] });
    // 👨‍💻 由多个码元组成：man + ZWJ + laptop
    // 用种子切分强制跨边界
    for (const seed of [1, 2, 3, 5, 8]) {
      const { joined } = feedChunks(splitWithSeed(json, seed));
      expect(joined).toBe(value);
    }
  });

  it('多 emoji 混合文本', () => {
    const value = '🎉 开始 📈 上升 ⚠️ 注意 ❤️ 爱心';
    const json = JSON.stringify({ summary: value, meta: {} });
    const byChar = feedCharByChar(json).joined;
    expect(byChar).toBe(value);
    for (const seed of [7, 13, 21]) {
      const { joined } = feedChunks(splitWithSeed(json, seed));
      expect(joined).toBe(value);
    }
  });
});

describe('StreamingSummaryExtractor - 协议违规确定性失败', () => {
  // 辅助：在 push 或 finish 任一阶段捕获错误（runtime 实际行为）
  // 这些协议违规可能在 push 阶段（parser 同步解析完整 JSON 时）或 finish 阶段抛出。
  // 测试验证整个流程必然失败，不限定具体阶段。
  function runAndExpectError(json: string): StreamingSummaryParseError {
    const extractor = new StreamingSummaryExtractor();
    let caught: unknown;
    try {
      extractor.push(json);
      extractor.finish();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(StreamingSummaryParseError);
    return caught as StreamingSummaryParseError;
  }

  it('重复 summary key 抛出 StreamingSummaryParseError', () => {
    const err = runAndExpectError('{"summary":"a","summary":"b"}');
    expect(err.message).toContain('summary');
  });

  it('重复 summary key 错误信息可识别', () => {
    const err = runAndExpectError('{"summary":"a","summary":"b"}');
    expect(err.message).toContain('重复') || expect(err.message).toContain('summary');
  });

  it('summary 非字符串（number）抛出错误', () => {
    const err = runAndExpectError('{"summary":123}');
    expect(err.message).toContain('string');
  });

  it('summary 非字符串（object）抛出错误', () => {
    runAndExpectError('{"summary":{"a":1}}');
  });

  it('summary 为 null 抛出错误', () => {
    runAndExpectError('{"summary":null}');
  });

  it('summary 为 boolean 抛出错误', () => {
    runAndExpectError('{"summary":true}');
  });

  it('summary 为数组抛出错误', () => {
    runAndExpectError('{"summary":[1,2,3]}');
  });

  it('逐字符喂入重复 key 也会在 finish 时抛错', () => {
    // 逐字符时 parser 不会在 push 同步抛（第二个 summary 解析完才触发），
    // 此场景错误在 finish 时通过 summaryFinalReceived 状态检测
    const extractor = new StreamingSummaryExtractor();
    let caught: unknown;
    try {
      for (const ch of '{"summary":"a","summary":"b"}') {
        extractor.push(ch);
      }
      extractor.finish();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(StreamingSummaryParseError);
  });
});

describe('StreamingSummaryExtractor - markdown fence 与截断', () => {
  it('输入以 ``` 开头（markdown fence）抛出错误', () => {
    const extractor = new StreamingSummaryExtractor();
    const fenced = '```json\n{"summary":"x"}\n```';
    expect(() => extractor.push(fenced)).toThrow(StreamingSummaryParseError);
  });

  it('逐字符喂入 markdown fence 在第一个反引号处即抛错', () => {
    const extractor = new StreamingSummaryExtractor();
    expect(() => extractor.push('`')).toThrow(StreamingSummaryParseError);
  });

  it('前导空白后跟 ``` 也抛错', () => {
    const extractor = new StreamingSummaryExtractor();
    expect(() => extractor.push('  \n ```json')).toThrow(StreamingSummaryParseError);
  });

  it('合法 JSON 前导空白被允许（非 fence）', () => {
    const extractor = new StreamingSummaryExtractor();
    const deltas: string[] = [];
    deltas.push(...extractor.push('  \n\t {"summary":"ok"}'));
    extractor.finish();
    expect(deltas.join('')).toBe('ok');
  });

  it('截断的 JSON（字符串未闭合）finish 抛出错误', () => {
    const extractor = new StreamingSummaryExtractor();
    extractor.push('{"summary":"未闭合');
    expect(() => extractor.finish()).toThrow(StreamingSummaryParseError);
  });

  it('截断的 JSON（对象未闭合）finish 抛出错误', () => {
    const extractor = new StreamingSummaryExtractor();
    extractor.push('{"summary":"ok"');
    expect(() => extractor.finish()).toThrow(StreamingSummaryParseError);
  });

  it('截断的 JSON（无 summary 字段）finish 抛出错误', () => {
    const extractor = new StreamingSummaryExtractor();
    extractor.push('{"actions":[]');
    expect(() => extractor.finish()).toThrow(StreamingSummaryParseError);
  });

  it('完全无 summary 字段的完整 JSON，finish 抛出错误', () => {
    const extractor = new StreamingSummaryExtractor();
    extractor.push('{"actions":[1,2,3]}');
    expect(() => extractor.finish()).toThrow(StreamingSummaryParseError);
  });
});

describe('StreamingSummaryExtractor - push 返回值语义', () => {
  it('不涉及 summary 推进的 chunk 返回空数组', () => {
    const extractor = new StreamingSummaryExtractor();
    const before = extractor.push('{"actions":[1,2,3],');
    // 到 summary 字段之前，不应产生 delta
    expect(before).toEqual([]);
  });

  it('推进 summary 的 chunk 返回新增的 delta', () => {
    const extractor = new StreamingSummaryExtractor();
    extractor.push('{"summary":"');
    const d1 = extractor.push('你好');
    expect(d1).toEqual(['你好']);
    const d2 = extractor.push('世界');
    expect(d2).toEqual(['世界']);
    extractor.push('"}');
    extractor.finish();
  });

  it('单字符增量喂入返回单字符 delta 数组', () => {
    const extractor = new StreamingSummaryExtractor();
    extractor.push('{"summary":"');
    const d = extractor.push('a');
    expect(d).toEqual(['a']);
  });

  it('finish 后再 push 抛出错误', () => {
    const extractor = new StreamingSummaryExtractor();
    extractor.push('{"summary":"x"}');
    extractor.finish();
    expect(() => extractor.push('more')).toThrow(StreamingSummaryParseError);
  });

  it('finish 调用两次抛出错误', () => {
    const extractor = new StreamingSummaryExtractor();
    extractor.push('{"summary":"x"}');
    extractor.finish();
    expect(() => extractor.finish()).toThrow(StreamingSummaryParseError);
  });
});

describe('StreamingSummaryExtractor - 完整真实场景', () => {
  it('模拟真实模型输出：大 JSON 含 summary 和 actions', () => {
    const value = '今日健康简报：睡眠质量良好，建议保持规律作息。运动量达标，继续努力！\n\n明日目标：步数 10000+。';
    const json = JSON.stringify({
      summary: value,
      actions: [
        { type: 'tip', text: '多喝水' },
        { type: 'tip', text: '早睡' },
      ],
      meta: { version: '1.0', timestamp: '2024-01-01T00:00:00Z' },
    });
    // 逐字符
    expect(feedCharByChar(json).joined).toBe(value);
    // 多种子切分
    for (const seed of [1, 7, 42, 100, 999]) {
      expect(feedChunks(splitWithSeed(json, seed)).joined).toBe(value);
    }
  });

  it('长 summary 文本跨多 chunk 稳定性', () => {
    const value = '这是一段相当长的 summary 文本，用于验证在各种 chunk 切分方式下，提取器都能稳定地增量释放 delta，且最终拼接结果与原始 summary 完全一致。包括中文、English mix、数字 12345、以及符号 !@#$%^&*() 和 emoji 😀🎉。';
    const json = JSON.stringify({ summary: value, actions: [] });
    expect(feedCharByChar(json).joined).toBe(value);
    for (const seed of [3, 6, 9, 12, 15, 18, 21, 24, 27, 30]) {
      expect(feedChunks(splitWithSeed(json, seed, 1, 13)).joined).toBe(value);
    }
  });
});
