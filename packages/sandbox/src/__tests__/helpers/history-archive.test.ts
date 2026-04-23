import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { loadHistoryArchive, validateHistoryArchive } from '../../helpers/history-archive';

const DATA_DIR = join(__dirname, '../../../../../data/sandbox');

describe('loadHistoryArchive', () => {
  it('should load and return records for profile-a', () => {
    const records = loadHistoryArchive(DATA_DIR, {
      file: 'history/profile-a-daily-records.json',
    });

    expect(records).toHaveLength(31);
    expect(records[0]!.date).toBe('2026-03-24');
    expect(records[records.length - 1]!.date).toBe('2026-04-23');
  });

  it('should load and return records for profile-b', () => {
    const records = loadHistoryArchive(DATA_DIR, {
      file: 'history/profile-b-daily-records.json',
    });

    expect(records).toHaveLength(31);
    expect(records[0]!.date).toBe('2026-03-24');
  });

  it('should load and return records for profile-c', () => {
    const records = loadHistoryArchive(DATA_DIR, {
      file: 'history/profile-c-daily-records.json',
    });

    expect(records).toHaveLength(31);
  });

  it('should throw for nonexistent file', () => {
    expect(() =>
      loadHistoryArchive(DATA_DIR, { file: 'history/nonexistent.json' }),
    ).toThrow();
  });

  it('each record should have valid date and data fields', () => {
    const records = loadHistoryArchive(DATA_DIR, {
      file: 'history/profile-a-daily-records.json',
    });

    for (const record of records) {
      expect(record.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // hr 数组应该存在且有 5 个值
      expect(record.hr).toBeDefined();
      expect(record.hr!.length).toBe(5);
    }
  });
});

describe('validateHistoryArchive', () => {
  it('should pass for valid continuous records', () => {
    const records = [
      { date: '2026-01-01', hr: [60] },
      { date: '2026-01-02', hr: [62] },
      { date: '2026-01-03', hr: [58] },
    ];

    // 不应抛出异常
    expect(() => validateHistoryArchive(records)).not.toThrow();
  });

  it('should throw for empty records', () => {
    expect(() => validateHistoryArchive([])).toThrow('历史记录不能为空');
  });

  it('should throw for non-continuous dates', () => {
    const records = [
      { date: '2026-01-01', hr: [60] },
      { date: '2026-01-03', hr: [62] }, // 跳过了 01-02
    ];

    expect(() => validateHistoryArchive(records)).toThrow('日期不连续');
  });

  it('should throw for invalid date format', () => {
    const records = [
      { date: 'invalid-date', hr: [60] },
    ];

    expect(() => validateHistoryArchive(records)).toThrow('日期格式无效');
  });

  it('should handle single record', () => {
    const records = [
      { date: '2026-01-01', hr: [60] },
    ];

    expect(() => validateHistoryArchive(records)).not.toThrow();
  });

  it('should handle leap year February correctly', () => {
    const records = [
      { date: '2024-02-28', hr: [60] },
      { date: '2024-02-29', hr: [62] }, // 闰年
      { date: '2024-03-01', hr: [58] },
    ];

    expect(() => validateHistoryArchive(records)).not.toThrow();
  });
});
