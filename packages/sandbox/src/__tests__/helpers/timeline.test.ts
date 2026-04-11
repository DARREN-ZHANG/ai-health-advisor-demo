import { describe, it, expect } from 'vitest';
import { normalizeTimeline, rollingMedian } from '../../helpers/timeline';
import type { DailyRecord } from '@health-advisor/shared';

const records: DailyRecord[] = [
  {
    date: '2026-04-01',
    hr: [60, 62, 61, 63, 60],
    sleep: {
      totalMinutes: 420,
      startTime: '22:00',
      endTime: '06:00',
      stages: { deep: 80, light: 200, rem: 90, awake: 10 },
      score: 85,
    },
    activity: { steps: 8000, calories: 2200, activeMinutes: 40, distanceKm: 5.8 },
    spo2: 98,
    stress: { load: 30 },
  },
  {
    date: '2026-04-02',
    spo2: 96,
    stress: { load: 45 },
  },
  {
    date: '2026-04-03',
    hr: [62, 64, 63, 65, 62],
    sleep: {
      totalMinutes: 380,
      startTime: '23:00',
      endTime: '06:20',
      stages: { deep: 70, light: 180, rem: 80, awake: 20 },
      score: 75,
    },
  },
];

describe('normalizeTimeline', () => {
  it('should extract top-level metrics', () => {
    const result = normalizeTimeline(records, ['spo2']);

    expect(result).toHaveLength(3);
    expect(result[0]!.values['spo2']).toBe(98);
    expect(result[1]!.values['spo2']).toBe(96);
    expect(result[2]!.values['spo2']).toBeNull();
  });

  it('should extract nested metrics with dot notation', () => {
    const result = normalizeTimeline(records, ['sleep.score', 'stress.load']);

    expect(result[0]!.values['sleep.score']).toBe(85);
    expect(result[0]!.values['stress.load']).toBe(30);

    expect(result[1]!.values['sleep.score']).toBeNull();
    expect(result[1]!.values['stress.load']).toBe(45);

    expect(result[2]!.values['sleep.score']).toBe(75);
    expect(result[2]!.values['stress.load']).toBeNull();
  });

  it('should extract activity nested metrics', () => {
    const result = normalizeTimeline(records, ['activity.steps']);

    expect(result[0]!.values['activity.steps']).toBe(8000);
    expect(result[1]!.values['activity.steps']).toBeNull();
    expect(result[2]!.values['activity.steps']).toBeNull();
  });

  it('should return null for missing metrics', () => {
    const result = normalizeTimeline(records, ['nonexistent']);

    for (const point of result) {
      expect(point.values['nonexistent']).toBeNull();
    }
  });

  it('should produce correct dates in output', () => {
    const result = normalizeTimeline(records, ['spo2']);

    expect(result.map((p) => p.date)).toEqual(['2026-04-01', '2026-04-02', '2026-04-03']);
  });

  it('should handle empty records', () => {
    const result = normalizeTimeline([], ['spo2']);

    expect(result).toEqual([]);
  });

  it('should handle empty metrics', () => {
    const result = normalizeTimeline(records, []);

    expect(result).toHaveLength(3);
    for (const point of result) {
      expect(Object.keys(point.values)).toHaveLength(0);
    }
  });
});

describe('rollingMedian', () => {
  it('对连续数值计算滚动中位数', () => {
    const result = rollingMedian([1, 3, 2, 5, 4, 6, 7], 3);
    // 窗口大小 3，half=1
    // i=0: [1,3,2] -> sort [1,2,3] -> 2
    // i=1: [1,3,2] -> sort [1,2,3] -> 2
    // i=2: [3,2,5] -> sort [2,3,5] -> 3
    // i=3: [2,5,4] -> sort [2,4,5] -> 4
    // i=4: [5,4,6] -> sort [4,5,6] -> 5
    // i=5: [4,6,7] -> sort [4,6,7] -> 6
    // i=6: [6,7] -> sort [6,7] -> (6+7)/2 = 6.5
    expect(result).toEqual([2, 2, 3, 4, 5, 6, 6.5]);
  });

  it('跳过 null 值进行计算', () => {
    const result = rollingMedian([null, 3, null, 5, 4], 3);
    // i=0: [3] -> 3 (窗口内只有 1 个有效值)
    // i=1: [3] -> 3
    // i=2: [3,5] -> (3+5)/2 = 4
    // i=3: [5,4] -> (4+5)/2 = 4.5
    // i=4: [5,4] -> (4+5)/2 = 4.5
    expect(result).toEqual([3, 3, 4, 4.5, 4.5]);
  });

  it('全部为 null 时返回 null', () => {
    const result = rollingMedian([null, null, null], 3);
    expect(result).toEqual([null, null, null]);
  });

  it('空数组返回空数组', () => {
    const result = rollingMedian([], 3);
    expect(result).toEqual([]);
  });

  it('默认窗口大小为 7', () => {
    const values: number[] = [10, 20, 30, 40, 50, 60, 70];
    const result = rollingMedian(values);
    // 默认窗口 7，中心元素 i=3 拥有完整窗口，中位数为 40
    expect(result).toHaveLength(7);
    expect(result[3]).toBe(40);
  });

  it('窗口大小为 1 时返回原始值', () => {
    const result = rollingMedian([5, null, 10], 1);
    expect(result).toEqual([5, null, 10]);
  });

  it('窗口大小为 0 时返回全 null', () => {
    const result = rollingMedian([1, 2, 3], 0);
    expect(result).toEqual([null, null, null]);
  });
});
