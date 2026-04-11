import type { ProfileData, DailyRecord, DataTab, Timeframe, DateRange, StressTimelineResponse, StressTimelinePoint, StressSummaryStats, StressTrend } from '@health-advisor/shared';
import { timeframeToDateRange } from '@health-advisor/shared';
import { normalizeTimeline, rollingMedian, type TimelinePoint } from '@health-advisor/sandbox';
import type { RuntimeRegistry } from '../../runtime/registry.js';

// tab → 需要提取的 metrics
const TAB_METRICS: Record<DataTab, string[]> = {
  hrv: ['hr'],
  sleep: ['sleep.totalMinutes', 'sleep.score', 'sleep.stages.deep', 'sleep.stages.rem', 'sleep.stages.light'],
  'resting-hr': ['hr'],
  activity: ['activity.steps', 'activity.calories', 'activity.activeMinutes'],
  spo2: ['spo2'],
  stress: ['stress.load'],
};

export interface TimelineDataResponse {
  profileId: string;
  range: DateRange;
  records: DailyRecord[];
}

export interface DataCenterResponse {
  profileId: string;
  tab: DataTab;
  timeframe: Timeframe;
  range: DateRange;
  timeline: TimelinePoint[];
  metadata: {
    recordCount: number;
    metrics: string[];
  };
}

export class DataService {
  constructor(private registry: RuntimeRegistry) {}

  getTimelineData(
    profileId: string,
    timeframe: Timeframe,
    customDateRange?: DateRange,
  ): TimelineDataResponse {
    const profile = this.registry.getProfile(profileId);
    const range = timeframeToDateRange(timeframe, undefined, customDateRange);
    const records = this.registry.selectByTimeframe(profile.records, timeframe, {
      referenceDate: range.end,
      customDateRange,
    });

    return { profileId, range, records };
  }

  getDataCenterData(
    profileId: string,
    tab: DataTab,
    timeframe: Timeframe,
    customDateRange?: DateRange,
  ): DataCenterResponse | StressTimelineResponse {
    const profile = this.registry.getProfile(profileId);
    const range = timeframeToDateRange(timeframe, undefined, customDateRange);
    const records = this.registry.selectByTimeframe(profile.records, timeframe, {
      referenceDate: range.end,
      customDateRange,
    });

    const metrics = TAB_METRICS[tab] ?? ['hr'];
    const timeline = normalizeTimeline(records, metrics);

    // stress tab 返回特殊的 StressTimelineResponse
    if (tab === 'stress') {
      return buildStressTimelineResponse(records, timeline, range);
    }

    return {
      profileId,
      tab,
      timeframe,
      range,
      timeline,
      metadata: { recordCount: records.length, metrics },
    };
  }
}

function buildStressTimelineResponse(
  records: DailyRecord[],
  timeline: TimelinePoint[],
  range: DateRange,
): StressTimelineResponse {
  const rawLoads = timeline.map((p) => p.values['stress.load'] ?? null);
  const smoothedLoads = rollingMedian(rawLoads, 7);

  const points: StressTimelinePoint[] = timeline.map((p, i) => ({
    date: p.date,
    stressLoadScore: smoothedLoads[i] ?? p.values['stress.load'] ?? 0,
    contributors: {
      hrv: p.values['hr'] ? Math.max(0, 100 - Math.abs(p.values['hr']! - 60)) : 50,
      sleep: p.values['sleep.totalMinutes']
        ? Math.min(100, (p.values['sleep.totalMinutes']! / 480) * 100)
        : 50,
      activity: p.values['activity.steps']
        ? Math.min(100, (p.values['activity.steps']! / 10000) * 100)
        : 50,
    },
  }));

  const validScores = points.map((p) => p.stressLoadScore);
  const average = validScores.length > 0
    ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
    : 0;
  const max = validScores.length > 0 ? Math.round(Math.max(...validScores)) : 0;
  const min = validScores.length > 0 ? Math.round(Math.min(...validScores)) : 0;

  const trend: StressTrend = computeTrend(validScores);

  return {
    points,
    summary: { average, max, min, trend },
  };
}

function computeTrend(scores: number[]): StressTrend {
  if (scores.length < 3) return 'stable';
  const half = Math.floor(scores.length / 2);
  const firstHalf = scores.slice(0, half);
  const secondHalf = scores.slice(half);
  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  const diff = avgSecond - avgFirst;
  if (diff > 5) return 'declining';
  if (diff < -5) return 'improving';
  return 'stable';
}
