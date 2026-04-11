import { describe, it, expect } from 'vitest';
import { isMissing, fillMissing } from '../../helpers/missing-value';

describe('isMissing', () => {
  it('should return true for null', () => {
    expect(isMissing(null)).toBe(true);
  });

  it('should return true for undefined', () => {
    expect(isMissing(undefined)).toBe(true);
  });

  it('should return false for 0', () => {
    expect(isMissing(0)).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isMissing('')).toBe(false);
  });

  it('should return false for valid number', () => {
    expect(isMissing(42)).toBe(false);
  });
});

describe('fillMissing', () => {
  const points = [
    { date: '2026-04-01', hr: 60 },
    { date: '2026-04-02', hr: null as unknown as undefined },
    { date: '2026-04-03', hr: 62 },
    { date: '2026-04-04', hr: undefined as unknown as number },
    { date: '2026-04-05', hr: 64 },
  ];

  it('should not mutate original array', () => {
    const original = structuredClone(points);
    fillMissing(points, 'hr', 'forward');

    expect(points).toEqual(original);
  });

  it('should fill with null strategy', () => {
    const result = fillMissing(points, 'hr', 'null');

    expect(result[0]!.hr).toBe(60);
    expect(result[1]!.hr).toBeNull();
    expect(result[2]!.hr).toBe(62);
    expect(result[3]!.hr).toBeNull();
    expect(result[4]!.hr).toBe(64);
  });

  it('should forward fill missing values', () => {
    const result = fillMissing(points, 'hr', 'forward');

    expect(result[0]!.hr).toBe(60);
    expect(result[1]!.hr).toBe(60);
    expect(result[2]!.hr).toBe(62);
    expect(result[3]!.hr).toBe(62);
    expect(result[4]!.hr).toBe(64);
  });

  it('should handle all missing values with forward fill', () => {
    const allMissing = [
      { date: '2026-04-01', hr: null as unknown as number },
      { date: '2026-04-02', hr: undefined as unknown as number },
    ];
    const result = fillMissing(allMissing, 'hr', 'forward');

    expect(result[0]!.hr).toBeNull();
    expect(result[1]!.hr).toBeNull();
  });

  it('should handle array with no missing values', () => {
    const complete = [
      { date: '2026-04-01', hr: 60 },
      { date: '2026-04-02', hr: 62 },
    ];
    const result = fillMissing(complete, 'hr', 'forward');

    expect(result[0]!.hr).toBe(60);
    expect(result[1]!.hr).toBe(62);
  });
});
