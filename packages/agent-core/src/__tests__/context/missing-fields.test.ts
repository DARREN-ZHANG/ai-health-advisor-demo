import { describe, it, expect } from 'vitest';
import { detectMissingFields } from '../../context/missing-fields';
import type { DailyRecord } from '@health-advisor/shared';

describe('detectMissingFields', () => {
  const metrics = ['hr', 'sleep', 'spo2'] as const;

  it('returns empty when all fields present', () => {
    const records: DailyRecord[] = [
      { date: '2026-04-01', hr: [60], sleep: { totalMinutes: 420, startTime: '23:00', endTime: '06:00', stages: { deep: 90, light: 180, rem: 120, awake: 30 }, score: 85 }, spo2: 98 },
      { date: '2026-04-02', hr: [62], sleep: { totalMinutes: 400, startTime: '23:30', endTime: '06:10', stages: { deep: 80, light: 170, rem: 110, awake: 40 }, score: 80 }, spo2: 97 },
    ];
    expect(detectMissingFields(records, metrics)).toEqual([]);
  });

  it('returns fields missing in majority of records', () => {
    const records: DailyRecord[] = [
      { date: '2026-04-01', hr: [60] },
      { date: '2026-04-02', hr: [62] },
      { date: '2026-04-03' },
    ];
    // sleep 和 spo2 在所有 3 条记录中都缺失（>50%）
    const missing = detectMissingFields(records, metrics);
    expect(missing).toContain('sleep');
    expect(missing).toContain('spo2');
    expect(missing).not.toContain('hr');
  });

  it('returns all metrics for empty records', () => {
    expect(detectMissingFields([], metrics)).toEqual([...metrics]);
  });
});
