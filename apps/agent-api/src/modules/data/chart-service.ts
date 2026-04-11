import type { ChartTokenId, Timeframe, DateRange } from '@health-advisor/shared';
import { timeframeToDateRange } from '@health-advisor/shared';
import { normalizeTimeline, type TimelinePoint } from '@health-advisor/sandbox';
import type { RuntimeRegistry } from '../../runtime/registry.js';

interface ChartSeriesConfig {
  metrics: string[];
  defaultDays: number;
}

const TOKEN_CONFIG: Record<ChartTokenId, ChartSeriesConfig> = {
  HRV_7DAYS: { metrics: ['hr'], defaultDays: 7 },
  SLEEP_7DAYS: { metrics: ['sleep.totalMinutes', 'sleep.score'], defaultDays: 7 },
  RESTING_HR_7DAYS: { metrics: ['hr'], defaultDays: 7 },
  ACTIVITY_7DAYS: { metrics: ['activity.steps'], defaultDays: 7 },
  SPO2_7DAYS: { metrics: ['spo2'], defaultDays: 7 },
  SLEEP_STAGE_LAST_NIGHT: { metrics: ['sleep.stages.deep', 'sleep.stages.rem', 'sleep.stages.light', 'sleep.stages.awake'], defaultDays: 1 },
  STRESS_LOAD_7DAYS: { metrics: ['stress.load'], defaultDays: 7 },
  HRV_SLEEP_14DAYS_COMPARE: { metrics: ['hr', 'sleep.totalMinutes'], defaultDays: 14 },
};

export interface ChartDataResponse {
  profileId: string;
  token: ChartTokenId;
  range: DateRange;
  timeline: TimelinePoint[];
}

export class ChartService {
  constructor(private registry: RuntimeRegistry) {}

  getChartData(
    profileId: string,
    tokenIds: ChartTokenId[],
    timeframe: Timeframe,
    customDateRange?: DateRange,
  ): ChartDataResponse[] {
    const profile = this.registry.getProfile(profileId);

    return tokenIds.map((tokenId) => {
      const config = TOKEN_CONFIG[tokenId];
      const range = timeframeToDateRange(timeframe, undefined, customDateRange);
      const records = this.registry.selectByTimeframe(profile.records, timeframe, {
        referenceDate: range.end,
        customDateRange,
      });
      const timeline = normalizeTimeline(records, config.metrics);

      return { profileId, token: tokenId, range, timeline };
    });
  }
}
