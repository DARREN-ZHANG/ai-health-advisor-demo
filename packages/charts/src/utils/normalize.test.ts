import { describe, it, expect } from 'vitest';
import { toTimeSeries, type ChartDataPoint } from './normalize';

describe('toTimeSeries', () => {
  it('空数组返回空结果', () => {
    const result = toTimeSeries([]);
    expect(result).toEqual({ dates: [], series: {} });
  });

  it('将 ChartDataPoint 数组转换为标准格式', () => {
    const points: ChartDataPoint[] = [
      { date: '2025-01-01', values: { hr: 72, 'hr.resting': 60 } },
      { date: '2025-01-02', values: { hr: 75, 'hr.resting': 62 } },
      { date: '2025-01-03', values: { hr: 68, 'hr.resting': 58 } },
    ];

    const result = toTimeSeries(points);

    expect(result.dates).toEqual(['2025-01-01', '2025-01-02', '2025-01-03']);
    expect(result.series).toEqual({
      hr: [72, 75, 68],
      'hr.resting': [60, 62, 58],
    });
  });

  it('处理 null 值', () => {
    const points: ChartDataPoint[] = [
      { date: '2025-01-01', values: { hr: 72, spo2: null } },
      { date: '2025-01-02', values: { hr: null, spo2: 98 } },
    ];

    const result = toTimeSeries(points);

    expect(result.series).toEqual({
      hr: [72, null],
      spo2: [null, 98],
    });
  });

  it('缺失的 key 用 null 填充', () => {
    const points: ChartDataPoint[] = [
      { date: '2025-01-01', values: { hr: 72 } },
      { date: '2025-01-02', values: {} },
    ];

    const result = toTimeSeries(points);

    expect(result.series).toEqual({
      hr: [72, null],
    });
  });
});
