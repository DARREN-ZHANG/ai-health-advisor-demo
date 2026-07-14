import { describe, it, expect } from 'vitest';
import { StreamingStructureExtractor } from '../streaming-structure-extractor';

const fullJson = JSON.stringify({
  summary: '今天状态不错',
  chartTokens: ['CHART_TOKEN_1'],
  actions: [
    { id: 'action_1', emoji: '💧', title: '补水', description: '运动后补水', aiPromise: '记录' },
    { id: 'action_2', emoji: '🧘', title: '拉伸', description: '放松肌肉', aiPromise: '记录' },
  ],
  actionsSectionTitle: '今天可以这样调整',
  futureSuggestions: [
    { timePoint: '15:30', predictedState: 'HRV低谷', rationale: '咖啡因影响', action: { id: 'f1', emoji: '🧘', title: '呼吸', description: '深呼吸', aiPromise: '记录' } },
    { timePoint: '20:00', predictedState: '入睡困难', rationale: '晚运动', action: { id: 'f2', emoji: '🛌', title: '放松', description: '冥想', aiPromise: '记录' } },
  ],
});

describe('StreamingStructureExtractor', () => {
  it('按顺序释放 action×2 → forecastStarted → suggestion×2', () => {
    const ext = new StreamingStructureExtractor();
    const signals = ext.push(fullJson);
    ext.finish();
    const kinds = signals.map((s) => s.kind);
    expect(kinds).toEqual(['action', 'action', 'forecastStarted', 'suggestion', 'suggestion']);
  });

  it('action 信号带正确 index 与 value', () => {
    const ext = new StreamingStructureExtractor();
    const signals = ext.push(fullJson);
    ext.finish();
    const actions = signals.filter((s) => s.kind === 'action');
    expect(actions[0]).toMatchObject({ kind: 'action', index: 0 });
    expect((actions[0] as { action: { id: string } }).action.id).toBe('action_1');
    expect(actions[1]).toMatchObject({ kind: 'action', index: 1 });
  });

  it('suggestion 信号带正确 index 与 value', () => {
    const ext = new StreamingStructureExtractor();
    const signals = ext.push(fullJson);
    ext.finish();
    const suggestions = signals.filter((s) => s.kind === 'suggestion');
    expect(suggestions[0]).toMatchObject({ kind: 'suggestion', index: 0 });
    expect((suggestions[0] as { suggestion: { timePoint: string } }).suggestion.timePoint).toBe('15:30');
  });

  it('forecastStarted 只释放一次（在第一个 suggestion 之前）', () => {
    const ext = new StreamingStructureExtractor();
    const signals = ext.push(fullJson);
    ext.finish();
    const forecastCount = signals.filter((s) => s.kind === 'forecastStarted').length;
    expect(forecastCount).toBe(1);
    const firstSuggestionIdx = signals.findIndex((s) => s.kind === 'suggestion');
    const forecastIdx = signals.findIndex((s) => s.kind === 'forecastStarted');
    expect(forecastIdx).toBeLessThan(firstSuggestionIdx);
  });

  it('多 chunk 切分（每 5 字符）结果一致', () => {
    const ext = new StreamingStructureExtractor();
    const signals = [];
    for (let i = 0; i < fullJson.length; i += 5) {
      signals.push(...ext.push(fullJson.slice(i, i + 5)));
    }
    ext.finish();
    expect(signals.map((s) => s.kind)).toEqual(['action', 'action', 'forecastStarted', 'suggestion', 'suggestion']);
  });

  it('futureSuggestions 缺省时只释放 action，无 forecastStarted/suggestion', () => {
    const ext = new StreamingStructureExtractor();
    const signals = ext.push(JSON.stringify({ summary: 'x', actions: [{ id: 'a1', title: 't', emoji: '💧', description: 'd', aiPromise: 'p' }] }));
    ext.finish();
    expect(signals.map((s) => s.kind)).toEqual(['action']);
  });

  it('futureSuggestions 空数组时不释放 forecastStarted', () => {
    const ext = new StreamingStructureExtractor();
    const signals = ext.push(JSON.stringify({ summary: 'x', actions: [], futureSuggestions: [] }));
    ext.finish();
    expect(signals).toEqual([]);
  });

  it('surrogate pair 跨 chunk 边界不乱码', () => {
    const json = JSON.stringify({
      actions: [{ id: 'a1', emoji: '𝄞', title: 't', description: 'd', aiPromise: 'p' }],
    });
    // 在 surrogate pair 中间切
    const cut = json.indexOf('\uD834');
    const ext = new StreamingStructureExtractor();
    const signals = [
      ...ext.push(json.slice(0, cut + 1)),
      ...ext.push(json.slice(cut + 1)),
    ];
    ext.finish();
    expect(signals.length).toBe(1);
    expect((signals[0] as { action: { emoji: string } }).action.emoji).toBe('𝄞');
  });

  it('markdown fence 前导抛错', () => {
    const ext = new StreamingStructureExtractor();
    expect(() => ext.push('```json\n{')).toThrow();
  });

  it('畸形 JSON 中途：已释放信号保留，finish 不抛（吞错）', () => {
    const ext = new StreamingStructureExtractor();
    const signals = ext.push(JSON.stringify({
      actions: [{ id: 'a1', title: 't', emoji: '💧', description: 'd', aiPromise: 'p' }],
    }) + '}'); // 末尾多余 }
    expect(signals.length).toBe(1); // action_1 已释放
    expect(() => ext.finish()).not.toThrow(); // 吞错，不抛
  });
});
