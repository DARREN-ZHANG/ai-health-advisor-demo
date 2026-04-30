import { ChartTokenId, type DataTab, type Timeframe } from '@health-advisor/shared';
import type { DailyRecord } from '@health-advisor/shared';
import type { VisibleChartPacket, MetricName } from './context-packet';
import type { EvidenceCollector } from './evidence-packet';
import { buildMetricSummary } from './metric-summary';

// ────────────────────────────────────────────
// Tab 到 ChartToken 映射
// ────────────────────────────────────────────

const TAB_TOKEN_MAP: Record<DataTab, ChartTokenId> = {
  overview: ChartTokenId.HRV_7DAYS,
  hrv: ChartTokenId.HRV_7DAYS,
  sleep: ChartTokenId.SLEEP_7DAYS,
  'resting-hr': ChartTokenId.RESTING_HR_7DAYS,
  activity: ChartTokenId.ACTIVITY_7DAYS,
  spo2: ChartTokenId.SPO2_7DAYS,
  stress: ChartTokenId.STRESS_LOAD_7DAYS,
};

const TAB_METRIC_MAP: Record<DataTab, MetricName> = {
  overview: 'hrv',
  hrv: 'hrv',
  sleep: 'sleep',
  'resting-hr': 'resting-hr',
  activity: 'activity',
  spo2: 'spo2',
  stress: 'stress',
};

const OVERVIEW_TOKENS: ChartTokenId[] = [
  ChartTokenId.HRV_7DAYS,
  ChartTokenId.SLEEP_7DAYS,
  ChartTokenId.RESTING_HR_7DAYS,
  ChartTokenId.ACTIVITY_7DAYS,
  ChartTokenId.SPO2_7DAYS,
  ChartTokenId.STRESS_LOAD_7DAYS,
];

// ────────────────────────────────────────────
// 构建 VisibleChartPacket
// ────────────────────────────────────────────

export function buildVisibleChartPackets(
  records: DailyRecord[],
  tab: DataTab | undefined,
  timeframe: Timeframe,
  baselines?: Partial<Record<MetricName, number>>,
  visibleChartIds?: string[],
): VisibleChartPacket[] {
  // 当 tab 未定义但 visibleChartIds 存在时，用 tab id 列表构建图表
  if (!tab && visibleChartIds && visibleChartIds.length > 0) {
    return buildFromChartIds(records, visibleChartIds, timeframe, baselines);
  }

  if (!tab) return [];

  if (tab === 'overview') {
    return OVERVIEW_TOKENS.map((token) => {
      const metric = tokenToMetric(token);
      const summary = buildMetricSummary(records, metric, baselines?.[metric], `visible_chart_${metric}`);
      return {
        chartToken: token,
        metric,
        timeframe,
        visible: true,
        dataSummary: summary,
        evidenceIds: summary.evidenceIds,
      };
    });
  }

  const token = TAB_TOKEN_MAP[tab];
  const metric = TAB_METRIC_MAP[tab];
  if (!token || !metric) return [];

  const summary = buildMetricSummary(records, metric, baselines?.[metric], `visible_chart_${metric}`);
  return [
    {
      chartToken: token,
      metric,
      timeframe,
      visible: true,
      dataSummary: summary,
      evidenceIds: summary.evidenceIds,
    },
  ];
}

// ────────────────────────────────────────────
// Token 到 Metric 反向映射
// ────────────────────────────────────────────

// 从 visibleChartIds（tab id 列表）构建 VisibleChartPacket
function buildFromChartIds(
  records: DailyRecord[],
  chartIds: string[],
  timeframe: Timeframe,
  baselines?: Partial<Record<MetricName, number>>,
): VisibleChartPacket[] {
  const results: VisibleChartPacket[] = [];
  for (const id of chartIds) {
    // chartId 是 tab id 格式（如 "sleep"），需要校验是否合法
    if (!(id in TAB_TOKEN_MAP)) continue;
    const tabId = id as DataTab;
    const token = TAB_TOKEN_MAP[tabId];
    const metric = TAB_METRIC_MAP[tabId];
    if (!token || !metric) continue;

    const summary = buildMetricSummary(records, metric, baselines?.[metric], `visible_chart_${metric}`);
    results.push({
      chartToken: token,
      metric,
      timeframe,
      visible: true,
      dataSummary: summary,
      evidenceIds: summary.evidenceIds,
    });
  }
  return results;
}

// ────────────────────────────────────────────
// Token 到 Metric 反向映射
// ────────────────────────────────────────────

function tokenToMetric(token: ChartTokenId): MetricName {
  switch (token) {
    case ChartTokenId.HRV_7DAYS:
      return 'hrv';
    case ChartTokenId.SLEEP_7DAYS:
      return 'sleep';
    case ChartTokenId.RESTING_HR_7DAYS:
      return 'resting-hr';
    case ChartTokenId.ACTIVITY_7DAYS:
      return 'activity';
    case ChartTokenId.SPO2_7DAYS:
      return 'spo2';
    case ChartTokenId.STRESS_LOAD_7DAYS:
      return 'stress';
    default:
      return 'hrv';
  }
}

export function getChartTokenForTab(tab: DataTab): ChartTokenId | undefined {
  return TAB_TOKEN_MAP[tab];
}

export function getMetricForTab(tab: DataTab): MetricName | undefined {
  return TAB_METRIC_MAP[tab];
}
