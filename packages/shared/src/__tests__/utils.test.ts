import { describe, it, expect } from 'vitest';
import { getDateRange, isDateInRange, generateDateRange } from '../utils/date-range';
import { timeframeToDateRange } from '../utils/timeframe';
import { parseChartTokenId } from '../utils/chart-token';
import { createPageContext } from '../utils/page-context';
import { getStatusColor, STATUS_COLORS } from '../constants/status-colors';
import { CHART_TOKEN_META, getChartTokenMeta } from '../constants/chart-tokens';
import { TIMEFRAME_CONFIGS } from '../constants/timeframes';
import { ChartTokenId } from '../types/chart-token';

describe('getDateRange', () => {
  it('returns correct range for 7 days', () => {
    const range = getDateRange(7, '2026-04-10');
    expect(range.end).toBe('2026-04-10');
    expect(range.start).toBe('2026-04-04');
  });

  it('returns 1 day range for 1 day', () => {
    const range = getDateRange(1, '2026-04-10');
    expect(range.start).toBe('2026-04-10');
    expect(range.end).toBe('2026-04-10');
  });

  it('uses current date when referenceDate is omitted', () => {
    const range = getDateRange(7);
    const today = new Date().toISOString().split('T')[0];
    expect(range.end).toBe(today);
  });
});

describe('isDateInRange', () => {
  const range = { start: '2026-04-04', end: '2026-04-10' };

  it('returns true for date in range', () => {
    expect(isDateInRange('2026-04-07', range)).toBe(true);
  });

  it('returns true for boundary dates', () => {
    expect(isDateInRange('2026-04-04', range)).toBe(true);
    expect(isDateInRange('2026-04-10', range)).toBe(true);
  });

  it('returns false for date outside range', () => {
    expect(isDateInRange('2026-04-03', range)).toBe(false);
    expect(isDateInRange('2026-04-11', range)).toBe(false);
  });
});

describe('generateDateRange', () => {
  it('generates all dates in range', () => {
    const dates = generateDateRange('2026-04-08', '2026-04-10');
    expect(dates).toEqual(['2026-04-08', '2026-04-09', '2026-04-10']);
  });
});

describe('timeframeToDateRange', () => {
  it('converts week timeframe to 7-day range', () => {
    const range = timeframeToDateRange('week', '2026-04-10');
    expect(range.end).toBe('2026-04-10');
    expect(range.start).toBe('2026-04-04');
  });
});

describe('parseChartTokenId', () => {
  it('returns valid token', () => {
    expect(parseChartTokenId('HRV_7DAYS')).toBe(ChartTokenId.HRV_7DAYS);
  });

  it('returns null for invalid token', () => {
    expect(parseChartTokenId('FAKE')).toBeNull();
  });
});

describe('getStatusColor', () => {
  it('returns correct status levels', () => {
    expect(getStatusColor(90, { good: 80, warning: 60 })).toBe('good');
    expect(getStatusColor(70, { good: 80, warning: 60 })).toBe('warning');
    expect(getStatusColor(50, { good: 80, warning: 60 })).toBe('alert');
  });
});

describe('STATUS_COLORS', () => {
  it('contains all status levels', () => {
    expect(STATUS_COLORS.good).toBe('#22c55e');
    expect(STATUS_COLORS.warning).toBe('#f59e0b');
    expect(STATUS_COLORS.alert).toBe('#ef4444');
    expect(STATUS_COLORS.neutral).toBe('#6b7280');
  });
});

describe('CHART_TOKEN_META', () => {
  it('has meta for every ChartTokenId', () => {
    Object.values(ChartTokenId).forEach((id) => {
      expect(CHART_TOKEN_META[id]).toBeDefined();
      expect(CHART_TOKEN_META[id].id).toBe(id);
      expect(CHART_TOKEN_META[id].label).toBeTruthy();
    });
  });
});

describe('getChartTokenMeta', () => {
  it('returns correct meta for a token', () => {
    const meta = getChartTokenMeta(ChartTokenId.HRV_7DAYS);
    expect(meta.id).toBe(ChartTokenId.HRV_7DAYS);
    expect(meta.label).toBe('HRV 趋势');
    expect(meta.unit).toBe('ms');
  });
});

describe('TIMEFRAME_CONFIGS', () => {
  it('has configs for all timeframes', () => {
    expect(TIMEFRAME_CONFIGS.day.days).toBe(1);
    expect(TIMEFRAME_CONFIGS.week.days).toBe(7);
    expect(TIMEFRAME_CONFIGS.month.days).toBe(30);
    expect(TIMEFRAME_CONFIGS.year.days).toBe(365);
  });
});

describe('createPageContext', () => {
  it('creates context with default timeframe', () => {
    const ctx = createPageContext('profile-a', 'dashboard');
    expect(ctx).toEqual({
      profileId: 'profile-a',
      page: 'dashboard',
      timeframe: 'week',
    });
  });

  it('creates context with custom timeframe and dataTab', () => {
    const ctx = createPageContext('profile-a', 'dashboard', 'day', 'hrv');
    expect(ctx).toEqual({
      profileId: 'profile-a',
      page: 'dashboard',
      timeframe: 'day',
      dataTab: 'hrv',
    });
  });

  it('creates context without dataTab when omitted', () => {
    const ctx = createPageContext('profile-a', 'dashboard', 'month');
    expect(ctx).toEqual({
      profileId: 'profile-a',
      page: 'dashboard',
      timeframe: 'month',
    });
    expect(ctx).not.toHaveProperty('dataTab');
  });
});
