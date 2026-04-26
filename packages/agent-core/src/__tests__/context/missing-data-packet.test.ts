import { describe, it, expect } from 'vitest';
import {
  buildMissingDataPacket,
  buildMissingDataForScope,
  findLastAvailableDate,
} from '../../context/missing-data-packet';
import { createEvidenceCollector } from '../../context/evidence-packet';
import type { DailyRecord } from '@health-advisor/shared';
import type { MetricName } from '../../context/context-packet';

function makeRecord(date: string, overrides: Partial<DailyRecord> = {}): DailyRecord {
  return { date, hr: [60, 62], hrv: 58, sleep: { totalMinutes: 420, startTime: '23:00', endTime: '06:00', stages: { deep: 90, light: 180, rem: 120, awake: 30 }, score: 85 }, activity: { steps: 8000, calories: 2200, activeMinutes: 45, distanceKm: 5.5 }, spo2: 98, stress: { load: 30 }, ...overrides };
}

describe('findLastAvailableDate', () => {
  it('finds the most recent date with data', () => {
    const records: DailyRecord[] = [
      makeRecord('2026-04-04'),
      makeRecord('2026-04-05', { hrv: undefined }),
      makeRecord('2026-04-06', { hrv: undefined }),
    ];
    const date = findLastAvailableDate(records, 'hrv');
    expect(date).toBe('2026-04-04');
  });

  it('returns undefined when no data available', () => {
    const records: DailyRecord[] = [
      makeRecord('2026-04-04', { hrv: undefined }),
      makeRecord('2026-04-05', { hrv: undefined }),
    ];
    const date = findLastAvailableDate(records, 'hrv');
    expect(date).toBeUndefined();
  });
});

describe('buildMissingDataForScope', () => {
  it('returns undefined when no missing data', () => {
    const records: DailyRecord[] = [
      makeRecord('2026-04-04'),
      makeRecord('2026-04-05'),
    ];
    const evidence = createEvidenceCollector();
    const item = buildMissingDataForScope(records, 'hrv', 'selectedWindow', evidence);
    expect(item).toBeUndefined();
  });

  it('returns MissingDataItem when data is missing', () => {
    const records: DailyRecord[] = [
      makeRecord('2026-04-04', { hrv: undefined }),
      makeRecord('2026-04-05', { hrv: undefined }),
      makeRecord('2026-04-06', { hrv: 58 }),
    ];
    const evidence = createEvidenceCollector();
    const item = buildMissingDataForScope(records, 'hrv', 'selectedWindow', evidence);

    expect(item).toBeDefined();
    expect(item?.metric).toBe('hrv');
    expect(item?.scope).toBe('selectedWindow');
    expect(item?.missingCount).toBe(2);
    expect(item?.totalCount).toBe(3);
    expect(item?.impact).toContain('HRV');
    expect(item?.requiredDisclosure).toBeDefined();
    expect(item?.evidenceId).toBe('missing_hrv_selectedWindow');
  });

  it('includes lastAvailableDate', () => {
    const records: DailyRecord[] = [
      makeRecord('2026-04-04', { hrv: 55 }),
      makeRecord('2026-04-05', { hrv: undefined }),
      makeRecord('2026-04-06', { hrv: undefined }),
    ];
    const evidence = createEvidenceCollector();
    const item = buildMissingDataForScope(records, 'hrv', 'latest24h', evidence);
    expect(item?.lastAvailableDate).toBe('2026-04-04');
  });
});

describe('buildMissingDataPacket', () => {
  it('returns empty array when all data present', () => {
    const records: DailyRecord[] = [
      makeRecord('2026-04-04'),
      makeRecord('2026-04-05'),
      makeRecord('2026-04-06'),
    ];
    const evidence = createEvidenceCollector();
    const items = buildMissingDataPacket(records, ['hrv', 'sleep'], evidence);
    expect(items).toEqual([]);
  });

  it('returns items for missing metrics', () => {
    const records: DailyRecord[] = [
      makeRecord('2026-04-04', { hrv: undefined }),
      makeRecord('2026-04-05', { hrv: undefined, sleep: undefined }),
      makeRecord('2026-04-06', { hrv: 58 }),
    ];
    const evidence = createEvidenceCollector();
    const items = buildMissingDataPacket(records, ['hrv', 'sleep'], evidence);
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => i.metric === 'hrv')).toBe(true);
    expect(items.some((i) => i.metric === 'sleep')).toBe(true);
  });

  it('generates evidence facts', () => {
    const records: DailyRecord[] = [
      makeRecord('2026-04-04', { hrv: undefined }),
    ];
    const evidence = createEvidenceCollector();
    buildMissingDataPacket(records, ['hrv'], evidence);
    expect(evidence.items.length).toBeGreaterThan(0);
    expect(evidence.items[0]?.id).toContain('missing_hrv');
  });

  it('supports latest24h scope', () => {
    const records: DailyRecord[] = [
      makeRecord('2026-04-04', { hrv: 55 }),
      makeRecord('2026-04-05', { hrv: undefined }),
    ];
    const evidence = createEvidenceCollector();
    const items = buildMissingDataPacket(records, ['hrv'], evidence, {
      scopes: ['latest24h'],
    });
    expect(items.length).toBe(1);
    expect(items[0]?.scope).toBe('latest24h');
    expect(items[0]?.missingCount).toBe(1);
    expect(items[0]?.totalCount).toBe(1);
  });

  it('supports trend7d scope', () => {
    const records: DailyRecord[] = [
      makeRecord('2026-04-04', { hrv: 55 }),
      makeRecord('2026-04-05', { hrv: undefined }),
      makeRecord('2026-04-06', { hrv: 58 }),
    ];
    const evidence = createEvidenceCollector();
    const items = buildMissingDataPacket(records, ['hrv'], evidence, {
      scopes: ['trend7d'],
    });
    expect(items.length).toBe(1);
    expect(items[0]?.scope).toBe('trend7d');
  });

  it('finds lastAvailableDate from allRecords when not in window', () => {
    const windowRecords: DailyRecord[] = [
      makeRecord('2026-04-09', { hrv: undefined }),
      makeRecord('2026-04-10', { hrv: undefined }),
    ];
    const allRecords: DailyRecord[] = [
      makeRecord('2026-04-04', { hrv: 55 }),
      makeRecord('2026-04-05', { hrv: 58 }),
      makeRecord('2026-04-06', { hrv: undefined }),
      makeRecord('2026-04-09', { hrv: undefined }),
      makeRecord('2026-04-10', { hrv: undefined }),
    ];
    const evidence = createEvidenceCollector();
    const items = buildMissingDataPacket(windowRecords, ['hrv'], evidence, {
      scopes: ['selectedWindow'],
      allRecords,
    });
    expect(items[0]?.lastAvailableDate).toBe('2026-04-05');
  });
});
