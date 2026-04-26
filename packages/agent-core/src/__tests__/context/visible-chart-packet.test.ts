import { describe, it, expect } from 'vitest';
import { buildVisibleChartPackets, getChartTokenForTab, getMetricForTab } from '../../context/visible-chart-packet';
import { ChartTokenId } from '@health-advisor/shared';
import type { DailyRecord } from '@health-advisor/shared';

function makeRecord(date: string, overrides: Partial<DailyRecord> = {}): DailyRecord {
  return { date, hr: [60, 62], hrv: 58, sleep: { totalMinutes: 420, startTime: '23:00', endTime: '06:00', stages: { deep: 90, light: 180, rem: 120, awake: 30 }, score: 85 }, activity: { steps: 8000, calories: 2200, activeMinutes: 45, distanceKm: 5.5 }, spo2: 98, stress: { load: 30 }, ...overrides };
}

describe('getChartTokenForTab', () => {
  it('maps hrv tab to HRV_7DAYS', () => {
    expect(getChartTokenForTab('hrv')).toBe(ChartTokenId.HRV_7DAYS);
  });

  it('maps sleep tab to SLEEP_7DAYS', () => {
    expect(getChartTokenForTab('sleep')).toBe(ChartTokenId.SLEEP_7DAYS);
  });

  it('maps overview to HRV_7DAYS', () => {
    expect(getChartTokenForTab('overview')).toBe(ChartTokenId.HRV_7DAYS);
  });
});

describe('getMetricForTab', () => {
  it('maps hrv tab to hrv metric', () => {
    expect(getMetricForTab('hrv')).toBe('hrv');
  });

  it('maps sleep tab to sleep metric', () => {
    expect(getMetricForTab('sleep')).toBe('sleep');
  });
});

describe('buildVisibleChartPackets', () => {
  it('returns empty for undefined tab', () => {
    const packets = buildVisibleChartPackets([], undefined, 'week');
    expect(packets).toEqual([]);
  });

  it('builds single tab packet', () => {
    const records: DailyRecord[] = [
      makeRecord('2026-04-04', { hrv: 55 }),
      makeRecord('2026-04-05', { hrv: 58 }),
      makeRecord('2026-04-06', { hrv: 62 }),
    ];
    const packets = buildVisibleChartPackets(records, 'hrv', 'week');
    expect(packets).toHaveLength(1);
    expect(packets[0]?.chartToken).toBe(ChartTokenId.HRV_7DAYS);
    expect(packets[0]?.metric).toBe('hrv');
    expect(packets[0]?.dataSummary.latest?.value).toBe(62);
    expect(packets[0]?.visible).toBe(true);
  });

  it('builds overview tab packets with all core tokens', () => {
    const records: DailyRecord[] = [
      makeRecord('2026-04-04'),
      makeRecord('2026-04-05'),
      makeRecord('2026-04-06'),
    ];
    const packets = buildVisibleChartPackets(records, 'overview', 'week');
    expect(packets.length).toBeGreaterThan(1);
    const tokens = packets.map((p) => p.chartToken);
    expect(tokens).toContain(ChartTokenId.HRV_7DAYS);
    expect(tokens).toContain(ChartTokenId.SLEEP_7DAYS);
    expect(tokens).toContain(ChartTokenId.RESTING_HR_7DAYS);
    expect(tokens).toContain(ChartTokenId.ACTIVITY_7DAYS);
    expect(tokens).toContain(ChartTokenId.SPO2_7DAYS);
    expect(tokens).toContain(ChartTokenId.STRESS_LOAD_7DAYS);
  });

  it('chart token is valid ChartTokenId', () => {
    const records: DailyRecord[] = [makeRecord('2026-04-04')];
    const packets = buildVisibleChartPackets(records, 'sleep', 'week');
    expect(packets[0]?.chartToken).toBe(ChartTokenId.SLEEP_7DAYS);
    // Verify it is a real enum value
    expect(Object.values(ChartTokenId)).toContain(packets[0]?.chartToken);
  });

  it('includes evidenceIds', () => {
    const records: DailyRecord[] = [
      makeRecord('2026-04-04', { hrv: 55 }),
      makeRecord('2026-04-05', { hrv: 58 }),
    ];
    const packets = buildVisibleChartPackets(records, 'hrv', 'week');
    expect(packets[0]?.evidenceIds.length).toBeGreaterThan(0);
  });
});
