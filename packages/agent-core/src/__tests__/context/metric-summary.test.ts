import { describe, it, expect } from 'vitest';
import { buildMetricSummary, buildMetricSummaries, getMetricValue, getRestingHR } from '../../context/metric-summary';
import type { DailyRecord } from '@health-advisor/shared';
import type { MetricName } from '../../context/context-packet';

function makeRecord(date: string, overrides: Partial<DailyRecord> = {}): DailyRecord {
  return { date, hr: [60, 62], hrv: 58, sleep: { totalMinutes: 420, startTime: '23:00', endTime: '06:00', stages: { deep: 90, light: 180, rem: 120, awake: 30 }, score: 85 }, activity: { steps: 8000, calories: 2200, activeMinutes: 45, distanceKm: 5.5 }, spo2: 98, stress: { load: 30 }, ...overrides };
}

describe('getMetricValue', () => {
  it('reads hrv', () => {
    const r = makeRecord('2026-04-10');
    expect(getMetricValue(r, 'hrv')).toBe(58);
  });

  it('reads sleep total minutes', () => {
    const r = makeRecord('2026-04-10');
    expect(getMetricValue(r, 'sleep')).toBe(420);
  });

  it('reads activity steps', () => {
    const r = makeRecord('2026-04-10');
    expect(getMetricValue(r, 'activity')).toBe(8000);
  });

  it('reads stress load', () => {
    const r = makeRecord('2026-04-10');
    expect(getMetricValue(r, 'stress')).toBe(30);
  });

  it('reads spo2', () => {
    const r = makeRecord('2026-04-10');
    expect(getMetricValue(r, 'spo2')).toBe(98);
  });

  it('reads resting hr from hr[0]', () => {
    const r = makeRecord('2026-04-10', { hr: [55, 60] });
    expect(getMetricValue(r, 'resting-hr')).toBe(55);
  });

  it('returns undefined for missing data', () => {
    const r: DailyRecord = { date: '2026-04-10' };
    expect(getMetricValue(r, 'hrv')).toBeUndefined();
    expect(getMetricValue(r, 'sleep')).toBeUndefined();
    expect(getMetricValue(r, 'activity')).toBeUndefined();
  });
});

describe('getRestingHR', () => {
  it('returns hr[0] when available', () => {
    const r = makeRecord('2026-04-10', { hr: [55] });
    expect(getRestingHR(r)).toBe(55);
  });

  it('returns undefined when hr is missing', () => {
    const r: DailyRecord = { date: '2026-04-10' };
    expect(getRestingHR(r)).toBeUndefined();
  });

  it('returns undefined when hr is empty array', () => {
    const r = makeRecord('2026-04-10', { hr: [] });
    expect(getRestingHR(r)).toBeUndefined();
  });
});

describe('buildMetricSummary', () => {
  it('computes latest, average, min, max for hrv', () => {
    const records: DailyRecord[] = [
      makeRecord('2026-04-04', { hrv: 55 }),
      makeRecord('2026-04-05', { hrv: 58 }),
      makeRecord('2026-04-06', { hrv: 62 }),
    ];
    const summary = buildMetricSummary(records, 'hrv', 58);

    expect(summary.metric).toBe('hrv');
    expect(summary.latest?.value).toBe(62);
    expect(summary.latest?.unit).toBe('ms');
    expect(summary.average?.value).toBeCloseTo(58.3, 0);
    expect(summary.min?.value).toBe(55);
    expect(summary.max?.value).toBe(62);
    expect(summary.baseline?.value).toBe(58);
    expect(summary.evidenceIds.length).toBeGreaterThan(0);
  });

  it('computes trend direction', () => {
    const records: DailyRecord[] = [
      makeRecord('2026-04-04', { hrv: 50 }),
      makeRecord('2026-04-05', { hrv: 52 }),
      makeRecord('2026-04-06', { hrv: 60 }),
      makeRecord('2026-04-07', { hrv: 65 }),
    ];
    const summary = buildMetricSummary(records, 'hrv');
    expect(summary.trendDirection).toBe('up');
  });

  it('returns stable when change is small', () => {
    const records: DailyRecord[] = [
      makeRecord('2026-04-04', { hrv: 58 }),
      makeRecord('2026-04-05', { hrv: 59 }),
      makeRecord('2026-04-06', { hrv: 58 }),
      makeRecord('2026-04-07', { hrv: 59 }),
    ];
    const summary = buildMetricSummary(records, 'hrv');
    expect(summary.trendDirection).toBe('stable');
  });

  it('returns unknown for fewer than 3 points', () => {
    const records: DailyRecord[] = [
      makeRecord('2026-04-04', { hrv: 58 }),
      makeRecord('2026-04-05', { hrv: 59 }),
    ];
    const summary = buildMetricSummary(records, 'hrv');
    expect(summary.trendDirection).toBe('unknown');
  });

  it('computes missing coverage', () => {
    const records: DailyRecord[] = [
      makeRecord('2026-04-04', { hrv: undefined }),
      makeRecord('2026-04-05'),
      makeRecord('2026-04-06', { hrv: 62 }),
    ];
    const summary = buildMetricSummary(records, 'hrv');
    expect(summary.missing.missingCount).toBe(1);
    expect(summary.missing.totalCount).toBe(3);
    expect(summary.missing.completenessPct).toBe(67);
  });

  it('computes deltaPctVsBaseline', () => {
    const records: DailyRecord[] = [
      makeRecord('2026-04-04', { hrv: 58 }),
    ];
    const summary = buildMetricSummary(records, 'hrv', 50);
    expect(summary.deltaPctVsBaseline).toBe(16); // (58-50)/50 = 16%
  });

  it('finds anomaly points', () => {
    const records: DailyRecord[] = [
      makeRecord('2026-04-01', { hrv: 58 }),
      makeRecord('2026-04-02', { hrv: 59 }),
      makeRecord('2026-04-03', { hrv: 58 }),
      makeRecord('2026-04-04', { hrv: 59 }),
      makeRecord('2026-04-05', { hrv: 60 }),
      makeRecord('2026-04-06', { hrv: 58 }),
      makeRecord('2026-04-07', { hrv: 59 }),
      makeRecord('2026-04-08', { hrv: 150 }), // extreme anomaly
    ];
    const summary = buildMetricSummary(records, 'hrv');
    expect(summary.anomalyPoints.length).toBeGreaterThan(0);
    expect(summary.anomalyPoints[0]?.date).toBe('2026-04-08');
  });
});

describe('buildMetricSummaries', () => {
  it('builds summaries for multiple metrics', () => {
    const records: DailyRecord[] = [
      makeRecord('2026-04-04'),
      makeRecord('2026-04-05'),
      makeRecord('2026-04-06'),
    ];
    const summaries = buildMetricSummaries(records, ['hrv', 'sleep', 'activity']);
    expect(summaries).toHaveLength(3);
    expect(summaries[0]?.metric).toBe('hrv');
    expect(summaries[1]?.metric).toBe('sleep');
    expect(summaries[2]?.metric).toBe('activity');
  });
});
