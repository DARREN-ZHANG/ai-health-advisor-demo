import { describe, it, expect } from 'vitest';
import { normalizeTimeline } from '../../helpers/timeline';
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
