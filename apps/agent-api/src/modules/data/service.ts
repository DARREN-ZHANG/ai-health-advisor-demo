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
  // stress tab: 主读 stress.load（含 override），同时携带底层指标供推导 fallback
  stress: ['stress.load', 'hr', 'sleep.totalMinutes', 'sleep.stages.deep', 'activity.steps'],
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

/**
 * 基于底层指标推导 stress load score
 *
 * ARCHITECTURE.md §9.3: stress 不作为 raw sandbox 字段落盘，由后端在读取时推导。
 * 推导公式基于 HRV、睡眠时长、深睡占比、活动量四个维度加权计算。
 */
function deriveStressLoadScore(p: TimelinePoint): number {
  // HRV 贡献：HRV 越低压力越大，基准 60ms
  const hr = p.values['hr'];
  const hrvContrib = hr != null
    ? Math.max(0, Math.min(100, 50 + (60 - hr) * 2))
    : 50;

  // 睡眠贡献：睡眠越少压力越大，基准 480 分钟（8 小时）
  const sleepMinutes = p.values['sleep.totalMinutes'];
  const sleepContrib = sleepMinutes != null
    ? Math.max(0, Math.min(100, 100 - (sleepMinutes / 480) * 80))
    : 50;

  // 深睡贡献：深睡越少压力越大，基准 90 分钟
  const deepSleep = p.values['sleep.stages.deep'];
  const deepSleepContrib = deepSleep != null
    ? Math.max(0, Math.min(100, 100 - (deepSleep / 90) * 60))
    : 50;

  // 活动贡献：中等活动量降低压力
  const steps = p.values['activity.steps'];
  const activityContrib = steps != null
    ? Math.max(0, Math.min(100, 100 - Math.min(steps / 8000, 1) * 40))
    : 50;

  // 加权求和
  const score = hrvContrib * 0.35 + sleepContrib * 0.25 + deepSleepContrib * 0.2 + activityContrib * 0.2;
  return Math.round(Math.max(0, Math.min(100, score)));
}

function buildStressTimelineResponse(
  _records: DailyRecord[],
  timeline: TimelinePoint[],
  range: DateRange,
): StressTimelineResponse {
  // 优先使用 stress.load（含 override），缺失时从底层指标推导
  const rawLoads = timeline.map((p) => p.values['stress.load'] ?? deriveStressLoadScore(p));
  const smoothedLoads = rollingMedian(rawLoads, 7);

  const points: StressTimelinePoint[] = timeline.map((p, i) => ({
    date: p.date,
    stressLoadScore: smoothedLoads[i] ?? rawLoads[i] ?? 0,
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
