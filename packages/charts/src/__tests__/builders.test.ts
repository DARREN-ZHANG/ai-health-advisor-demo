import { describe, it, expect } from 'vitest';
import {
  buildHrv7Days,
  buildSleep7Days,
  buildRestingHr7Days,
  buildActivity7Days,
  buildSpo27Days,
  buildStressLoad7Days,
  buildSleepStageLastNight,
  buildHrvSleep14DaysCompare,
} from '../builders/chart-builders';
import type { StandardTimeSeries } from '../utils/normalize';

const mockData: StandardTimeSeries = {
  dates: [
    '2025-01-01',
    '2025-01-02',
    '2025-01-03',
    '2025-01-04',
    '2025-01-05',
    '2025-01-06',
    '2025-01-07',
  ],
  series: {
    hrv: [52, 55, 50, 53, 56, 54, 57],
    hr: [72, 75, 68, 71, 74, 70, 73],
    'sleep.totalMinutes': [420, 390, 450, 480, 360, 420, 400],
    'hr.resting': [60, 62, 58, 61, 63, 59, 60],
    'activity.steps': [8000, 6500, 10000, 7500, 9000, 8200, 7800],
    spo2: [97, 98, 96, 97, 98, 97, 99],
    'stress.load': [45, 60, 30, 55, 70, 40, 50],
    'sleep.stages.deep': [80, 70, 90, 85, 65, 75, 80],
    'sleep.stages.light': [200, 180, 210, 220, 170, 195, 190],
    'sleep.stages.rem': [90, 80, 95, 100, 75, 85, 88],
    'sleep.stages.awake': [10, 20, 5, 15, 25, 12, 8],
  },
};

describe('chart builders', () => {
  const builders = [
    { name: 'buildHrv7Days', fn: buildHrv7Days, seriesKey: 'hrv' },
    { name: 'buildSleep7Days', fn: buildSleep7Days, seriesKey: 'sleep.totalMinutes' },
    { name: 'buildRestingHr7Days', fn: buildRestingHr7Days, seriesKey: 'hr.resting' },
    { name: 'buildActivity7Days', fn: buildActivity7Days, seriesKey: 'activity.steps' },
    { name: 'buildSpo27Days', fn: buildSpo27Days, seriesKey: 'spo2' },
    { name: 'buildStressLoad7Days', fn: buildStressLoad7Days, seriesKey: 'stress.load' },
  ];

  for (const { name, fn } of builders) {
    describe(name, () => {
      it('返回包含 series 的有效 ECharts option', () => {
        const option = fn(mockData);
        expect(option).toHaveProperty('series');
        expect(Array.isArray(option.series)).toBe(true);
        expect(option.series).toHaveLength(1);
      });

      it('返回包含 xAxis 的有效 ECharts option', () => {
        const option = fn(mockData);
        expect(option).toHaveProperty('xAxis');
      });

      it('返回包含 yAxis 的有效 ECharts option', () => {
        const option = fn(mockData);
        expect(option).toHaveProperty('yAxis');
      });
    });
  }

  it('buildSpo27Days 设置 yAxis min:85 max:100', () => {
    const option = buildSpo27Days(mockData);
    const yAxis = option.yAxis as Record<string, unknown>;
    expect(yAxis.min).toBe(85);
    expect(yAxis.max).toBe(100);
  });

  it('buildStressLoad7Days 设置 yAxis min:0 max:100', () => {
    const option = buildStressLoad7Days(mockData);
    const yAxis = option.yAxis as Record<string, unknown>;
    expect(yAxis.min).toBe(0);
    expect(yAxis.max).toBe(100);
  });

  it('buildSleep7Days 将分钟转换为小时', () => {
    const option = buildSleep7Days(mockData);
    const series = option.series as Array<{ data: (number | null)[] }>;
    expect(series[0]!.data[0]).toBe(7.0); // 420 分钟 = 7 小时
    expect(series[0]!.data[2]).toBe(7.5); // 450 分钟 = 7.5 小时
  });

  it('buildHrv7Days 使用 hrv series，而不是心率 hr series', () => {
    const option = buildHrv7Days(mockData);
    const series = option.series as Array<{ data: (number | null)[] }>;

    expect(series[0]!.data).toEqual(mockData.series.hrv);
  });
});

describe('buildSleepStageLastNight', () => {
  it('返回 4 个堆叠柱状图 series', () => {
    const option = buildSleepStageLastNight(mockData);
    const series = option.series as Array<{ name: string; type: string }>;
    expect(series).toHaveLength(4);
    expect(series.map((s) => s.name)).toEqual(['深睡', '浅睡', 'REM', '清醒']);
  });

  it('所有 series 使用 bar 类型', () => {
    const option = buildSleepStageLastNight(mockData);
    const series = option.series as Array<{ type: string }>;
    for (const s of series) {
      expect(s.type).toBe('bar');
    }
  });

  it('包含标题', () => {
    const option = buildSleepStageLastNight(mockData);
    expect(option).toHaveProperty('title');
  });
});

describe('buildHrvSleep14DaysCompare', () => {
  it('返回 2 条折线 series', () => {
    const option = buildHrvSleep14DaysCompare(mockData);
    const series = option.series as Array<{ name: string }>;
    expect(series).toHaveLength(2);
    expect(series[0]!.name).toBe('HRV');
    expect(series[1]!.name).toBe('睡眠');
  });

  it('使用双 Y 轴', () => {
    const option = buildHrvSleep14DaysCompare(mockData);
    expect(Array.isArray(option.yAxis)).toBe(true);
    const yAxis = option.yAxis as Array<Record<string, unknown>>;
    expect(yAxis).toHaveLength(2);
  });

  it('睡眠数据转换为小时', () => {
    const option = buildHrvSleep14DaysCompare(mockData);
    const series = option.series as Array<{ data: (number | null)[] }>;
    // 睡眠 series 是第二个，420 分钟 = 7 小时
    expect(series[1]!.data[0]).toBe(7.0);
  });

  it('HRV 数据使用 hrv series', () => {
    const option = buildHrvSleep14DaysCompare(mockData);
    const series = option.series as Array<{ data: (number | null)[] }>;

    expect(series[0]!.data).toEqual(mockData.series.hrv);
  });

  it('包含图例', () => {
    const option = buildHrvSleep14DaysCompare(mockData);
    expect(option).toHaveProperty('legend');
  });
});
