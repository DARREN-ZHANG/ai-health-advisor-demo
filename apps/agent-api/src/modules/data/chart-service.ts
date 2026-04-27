import type { ChartTokenId, Timeframe, DateRange } from '@health-advisor/shared';
import { timeframeToDateRange } from '@health-advisor/shared';
import { normalizeTimeline, normalizeIntradayTimeline, type TimelinePoint } from '@health-advisor/sandbox';
import type { RuntimeRegistry } from '../../runtime/registry.js';
import { DataService } from './service.js';

interface ChartSeriesConfig {
  metrics: string[];
  defaultDays: number;
}

const INTRADAY_METRICS = new Set([
  'hr',
  'sleep.totalMinutes',
  'activity.steps',
  'spo2',
  'stress.load',
]);

const TOKEN_CONFIG: Record<ChartTokenId, ChartSeriesConfig> = {
  HRV_7DAYS: { metrics: ['hrv'], defaultDays: 7 },
  SLEEP_7DAYS: { metrics: ['sleep.totalMinutes', 'sleep.score'], defaultDays: 7 },
  RESTING_HR_7DAYS: { metrics: ['hr'], defaultDays: 7 },
  ACTIVITY_7DAYS: { metrics: ['activity.steps'], defaultDays: 7 },
  SPO2_7DAYS: { metrics: ['spo2'], defaultDays: 7 },
  SLEEP_STAGE_LAST_NIGHT: { metrics: ['sleep.stages.deep', 'sleep.stages.rem', 'sleep.stages.light', 'sleep.stages.awake'], defaultDays: 1 },
  STRESS_LOAD_7DAYS: { metrics: ['stress.load'], defaultDays: 7 },
  HRV_SLEEP_14DAYS_COMPARE: { metrics: ['hrv', 'sleep.totalMinutes'], defaultDays: 14 },
};

export interface ChartDataResponse {
  profileId: string;
  token: ChartTokenId;
  range: DateRange;
  timeline: TimelinePoint[];
}

export class ChartService {
  private dataService: DataService;

  constructor(private registry: RuntimeRegistry) {
    this.dataService = new DataService(registry);
  }

  getChartData(
    profileId: string,
    tokenIds: ChartTokenId[],
    timeframe: Timeframe,
    customDateRange?: DateRange,
  ): ChartDataResponse[] {
    // 使用冻结历史 + 当前活动日聚合的 records
    const records = this.dataService.getRecordsForProfile(profileId);

    return tokenIds.map((tokenId) => {
      const config = TOKEN_CONFIG[tokenId];
      const range = timeframeToDateRange(timeframe, undefined, customDateRange);
      const filtered = this.registry.selectByTimeframe(records, timeframe, {
        referenceDate: range.end,
        customDateRange,
      });

      // day timeframe 仅对 IntradaySnapshot 可表达的指标使用分时数据。
      // HRV 是日级指标，不能从 intraday 快照读取。
      const timeline = timeframe === 'day' && config.metrics.every((metric) => INTRADAY_METRICS.has(metric))
        ? normalizeIntradayTimeline(filtered, config.metrics)
        : normalizeTimeline(filtered, config.metrics);

      return { profileId, token: tokenId, range, timeline };
    });
  }
}
