import { describe, expect, it } from 'vitest';
import { ChartTokenId } from '@health-advisor/shared';
import {
  normalizeChartDataByTokenResponse,
  normalizeChartDataResponse,
} from './use-data-query';

describe('chart data normalization', () => {
  const mixedDayResponse = [
    {
      profileId: 'profile-a',
      token: ChartTokenId.HRV_7DAYS,
      range: { start: '2026-04-30', end: '2026-04-30' },
      timeline: [{ date: '2026-04-30', values: { hrv: 102 } }],
    },
    {
      profileId: 'profile-a',
      token: ChartTokenId.SLEEP_7DAYS,
      range: { start: '2026-04-30', end: '2026-04-30' },
      timeline: [{ date: '2026-04-30', values: { 'sleep.totalMinutes': 379 } }],
    },
    {
      profileId: 'profile-a',
      token: ChartTokenId.RESTING_HR_7DAYS,
      range: { start: '2026-04-30', end: '2026-04-30' },
      timeline: [
        { date: '00:00', values: { hr: 59 } },
        { date: '02:00', values: { hr: 57 } },
      ],
    },
  ];

  it('keeps each token on its own timeline', () => {
    const result = normalizeChartDataByTokenResponse(mixedDayResponse);

    expect(result?.[ChartTokenId.HRV_7DAYS]).toEqual({
      dates: ['2026-04-30'],
      series: { hrv: [102] },
    });
    expect(result?.[ChartTokenId.SLEEP_7DAYS]).toEqual({
      dates: ['2026-04-30'],
      series: { 'sleep.totalMinutes': [379] },
    });
    expect(result?.[ChartTokenId.RESTING_HR_7DAYS]).toEqual({
      dates: ['00:00', '02:00'],
      series: { hr: [59, 57] },
    });
  });

  it('does not lose date-level metrics when producing the legacy merged series', () => {
    const result = normalizeChartDataResponse(mixedDayResponse);

    expect(result?.series.hrv).toContain(102);
    expect(result?.series['sleep.totalMinutes']).toContain(379);
    expect(result?.series.hr).toEqual(expect.arrayContaining([59, 57]));
  });
});
