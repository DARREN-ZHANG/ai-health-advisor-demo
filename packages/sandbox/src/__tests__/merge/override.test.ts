import { describe, it, expect } from 'vitest';
import { applyOverrides, type OverrideEntry } from '../../merge/override';
import type { DailyRecord } from '@health-advisor/shared';

const baseRecords: DailyRecord[] = [
  { date: '2026-04-08', spo2: 98, stress: { load: 30 } },
  { date: '2026-04-09', spo2: 97, stress: { load: 32 } },
  { date: '2026-04-10', spo2: 96, stress: { load: 35 } },
];

describe('applyOverrides', () => {
  it('should not mutate original records', () => {
    const overrides: OverrideEntry[] = [
      { metric: 'spo2', value: 90, dateRange: { start: '2026-04-08', end: '2026-04-10' } },
    ];
    const original = structuredClone(baseRecords);
    applyOverrides(baseRecords, overrides);

    expect(baseRecords).toEqual(original);
  });

  it('should return same reference when no overrides', () => {
    const result = applyOverrides(baseRecords, []);

    expect(result).toBe(baseRecords);
  });

  it('should override top-level field within date range', () => {
    const overrides: OverrideEntry[] = [
      { metric: 'spo2', value: 90, dateRange: { start: '2026-04-09', end: '2026-04-10' } },
    ];
    const result = applyOverrides(baseRecords, overrides);

    expect(result[0]!.spo2).toBe(98);
    expect(result[1]!.spo2).toBe(90);
    expect(result[2]!.spo2).toBe(90);
  });

  it('should override nested field with dot notation', () => {
    const overrides: OverrideEntry[] = [
      { metric: 'stress.load', value: 80, dateRange: { start: '2026-04-10', end: '2026-04-10' } },
    ];
    const result = applyOverrides(baseRecords, overrides);

    expect(result[0]!.stress!.load).toBe(30);
    expect(result[1]!.stress!.load).toBe(32);
    expect(result[2]!.stress!.load).toBe(80);
  });

  it('should apply override to all records when no date range specified', () => {
    const overrides: OverrideEntry[] = [{ metric: 'spo2', value: 95 }];
    const result = applyOverrides(baseRecords, overrides);

    expect(result.every((r) => r.spo2 === 95)).toBe(true);
  });

  it('should handle multiple overrides', () => {
    const overrides: OverrideEntry[] = [
      { metric: 'spo2', value: 92, dateRange: { start: '2026-04-10', end: '2026-04-10' } },
      { metric: 'stress.load', value: 85, dateRange: { start: '2026-04-10', end: '2026-04-10' } },
    ];
    const result = applyOverrides(baseRecords, overrides);

    expect(result[2]!.spo2).toBe(92);
    expect(result[2]!.stress!.load).toBe(85);
    // 前面的记录不受影响
    expect(result[0]!.spo2).toBe(98);
    expect(result[0]!.stress!.load).toBe(30);
  });

  it('should not modify records outside the date range', () => {
    const overrides: OverrideEntry[] = [
      { metric: 'spo2', value: 88, dateRange: { start: '2026-05-01', end: '2026-05-10' } },
    ];
    const result = applyOverrides(baseRecords, overrides);

    expect(result[0]!.spo2).toBe(98);
    expect(result[1]!.spo2).toBe(97);
    expect(result[2]!.spo2).toBe(96);
  });

  it('should return same record when top-level value is identical', () => {
    const records: DailyRecord[] = [{ date: '2026-04-01', spo2: 98 }];
    const overrides: OverrideEntry[] = [{ metric: 'spo2', value: 98 }];

    const result = applyOverrides(records, overrides);

    expect(result[0]).toBe(records[0]);
  });

  it('should return same record when nested value is identical', () => {
    const records: DailyRecord[] = [{ date: '2026-04-01', stress: { load: 50 } }];
    const overrides: OverrideEntry[] = [{ metric: 'stress.load', value: 50 }];

    const result = applyOverrides(records, overrides);

    expect(result[0]).toBe(records[0]);
  });

  it('should create nested object when field does not exist', () => {
    const records: DailyRecord[] = [{ date: '2026-04-01', spo2: 98 }];
    const overrides: OverrideEntry[] = [{ metric: 'stress.load', value: 60 }];

    const result = applyOverrides(records, overrides);

    expect(result[0]!.stress).toEqual({ load: 60 });
  });

  it('should handle deep nested path creation', () => {
    const records: DailyRecord[] = [{ date: '2026-04-01' }];
    // 虽然实际不常用，但需验证三层嵌套路径
    const overrides: OverrideEntry[] = [{ metric: 'stress.load', value: 70 }];

    const result = applyOverrides(records, overrides);

    expect(result[0]!.stress).toEqual({ load: 70 });
  });

  it('should override nested field without date range', () => {
    const records: DailyRecord[] = [
      { date: '2026-04-01', stress: { load: 20 } },
      { date: '2026-04-02', stress: { load: 25 } },
    ];
    const overrides: OverrideEntry[] = [{ metric: 'stress.load', value: 99 }];

    const result = applyOverrides(records, overrides);

    expect(result[0]!.stress!.load).toBe(99);
    expect(result[1]!.stress!.load).toBe(99);
  });
});
