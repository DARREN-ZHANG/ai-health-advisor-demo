import { describe, it, expect } from 'vitest';
import { validateChartTokens } from '../../output/token-validator';
import { ChartTokenId } from '@health-advisor/shared';

describe('validateChartTokens', () => {
  it('合法 token 全部通过', () => {
    const result = validateChartTokens([
      ChartTokenId.HRV_7DAYS,
      ChartTokenId.SLEEP_7DAYS,
    ]);

    expect(result.valid).toEqual([ChartTokenId.HRV_7DAYS, ChartTokenId.SLEEP_7DAYS]);
    expect(result.invalid).toEqual([]);
  });

  it('非法字符串 token 被过滤', () => {
    const result = validateChartTokens([
      ChartTokenId.HRV_7DAYS,
      'FAKE_TOKEN' as ChartTokenId,
    ]);

    expect(result.valid).toEqual([ChartTokenId.HRV_7DAYS]);
    expect(result.invalid).toEqual(['FAKE_TOKEN']);
  });

  it('对象 token 被过滤', () => {
    const result = validateChartTokens([
      ChartTokenId.HRV_7DAYS,
      { type: 'chart', id: 'hrv' } as unknown as ChartTokenId,
    ]);

    expect(result.valid).toEqual([ChartTokenId.HRV_7DAYS]);
    expect(result.invalid).toHaveLength(1);
  });

  it('空数组返回空结果', () => {
    const result = validateChartTokens([]);

    expect(result.valid).toEqual([]);
    expect(result.invalid).toEqual([]);
  });

  it('超过 MAX_CHART_TOKENS 时截断', () => {
    const allTokens = Object.values(ChartTokenId);
    const result = validateChartTokens(allTokens);

    expect(result.valid.length).toBeLessThanOrEqual(2);
  });

  it('null/undefined 被过滤', () => {
    const result = validateChartTokens([
      null as unknown as ChartTokenId,
      undefined as unknown as ChartTokenId,
      ChartTokenId.HRV_7DAYS,
    ]);

    expect(result.valid).toEqual([ChartTokenId.HRV_7DAYS]);
    expect(result.invalid).toHaveLength(2);
  });
});
