import { describe, it, expect } from 'vitest';
import { selectByDateRange, selectByTimeframe } from '../../selectors/date-range';
import type { DailyRecord } from '@health-advisor/shared';

const records: DailyRecord[] = [
  { date: '2026-04-01', spo2: 98 },
  { date: '2026-04-02', spo2: 97 },
  { date: '2026-04-03', spo2: 96 },
  { date: '2026-04-04', spo2: 98 },
  { date: '2026-04-05', spo2: 97 },
  { date: '2026-04-06', spo2: 96 },
  { date: '2026-04-07', spo2: 98 },
  { date: '2026-04-08', spo2: 97 },
  { date: '2026-04-09', spo2: 96 },
  { date: '2026-04-10', spo2: 98 },
];

describe('selectByDateRange', () => {
  it('should filter records within range', () => {
    const result = selectByDateRange(records, { start: '2026-04-03', end: '2026-04-05' });

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.date)).toEqual(['2026-04-03', '2026-04-04', '2026-04-05']);
  });

  it('should return empty when no records match', () => {
    const result = selectByDateRange(records, { start: '2025-01-01', end: '2025-01-31' });

    expect(result).toHaveLength(0);
  });

  it('should return single record for same start and end', () => {
    const result = selectByDateRange(records, { start: '2026-04-05', end: '2026-04-05' });

    expect(result).toHaveLength(1);
    expect(result[0]!.date).toBe('2026-04-05');
  });

  it('should return all records for wide range', () => {
    const result = selectByDateRange(records, { start: '2026-01-01', end: '2026-12-31' });

    expect(result).toHaveLength(records.length);
  });
});

describe('selectByTimeframe', () => {
  it('should select 7 days of records with reference date', () => {
    const result = selectByTimeframe(records, 'week', '2026-04-10');

    expect(result).toHaveLength(7);
    expect(result[0]!.date).toBe('2026-04-04');
    expect(result[6]!.date).toBe('2026-04-10');
  });

  it('should select 1 day for "day" timeframe', () => {
    const result = selectByTimeframe(records, 'day', '2026-04-05');

    expect(result).toHaveLength(1);
    expect(result[0]!.date).toBe('2026-04-05');
  });

  it('should select all records for "year" timeframe', () => {
    const result = selectByTimeframe(records, 'year', '2026-04-10');

    expect(result).toHaveLength(records.length);
  });
});
