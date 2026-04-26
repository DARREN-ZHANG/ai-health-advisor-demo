import type { DailyRecord } from '@health-advisor/shared';
import type { MetricName, MetricSummary, MetricValue, MissingDataCoverage, MetricAnomalyPoint } from './context-packet';

// ────────────────────────────────────────────
// 指标配置：字段映射、单位、趋势阈值
// ────────────────────────────────────────────

interface MetricConfig {
  field: (r: DailyRecord) => number | undefined;
  unit: string;
  trendThreshold: number;
}

const METRIC_CONFIG: Record<MetricName, MetricConfig> = {
  hrv: {
    field: (r) => r.hrv,
    unit: 'ms',
    trendThreshold: 0.05,
  },
  sleep: {
    field: (r) => r.sleep?.totalMinutes,
    unit: 'min',
    trendThreshold: 0.05,
  },
  activity: {
    field: (r) => r.activity?.steps,
    unit: 'steps',
    trendThreshold: 0.10,
  },
  stress: {
    field: (r) => r.stress?.load,
    unit: 'score',
    trendThreshold: 0.10,
  },
  spo2: {
    field: (r) => r.spo2,
    unit: '%',
    trendThreshold: 0.01,
  },
  'resting-hr': {
    field: (r) => (Array.isArray(r.hr) && r.hr.length > 0 ? r.hr[0] : undefined),
    unit: 'bpm',
    trendThreshold: 0.05,
  },
};

// ────────────────────────────────────────────
// 公共辅助函数
// ────────────────────────────────────────────

export function getMetricValue(record: DailyRecord, metric: MetricName): number | undefined {
  return METRIC_CONFIG[metric].field(record);
}

export function getMetricUnit(metric: MetricName): string {
  return METRIC_CONFIG[metric].unit;
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function computeTrendDirection(values: number[], threshold: number): MetricSummary['trendDirection'] {
  if (values.length < 3) return 'unknown';
  const n = values.length;
  const firstHalf = average(values.slice(0, Math.floor(n / 2)));
  const secondHalf = average(values.slice(Math.floor(n / 2)));
  if (firstHalf === 0) return 'unknown';
  const change = (secondHalf - firstHalf) / Math.abs(firstHalf);
  if (Math.abs(change) < threshold) return 'stable';
  return change > 0 ? 'up' : 'down';
}

function computeMissingCoverage(records: DailyRecord[], metric: MetricName): MissingDataCoverage {
  const totalCount = records.length;
  if (totalCount === 0) {
    return { missingCount: 0, totalCount: 0, completenessPct: 0 };
  }
  const missingCount = records.filter((r) => getMetricValue(r, metric) === undefined).length;
  return {
    missingCount,
    totalCount,
    completenessPct: Math.round(((totalCount - missingCount) / totalCount) * 100),
  };
}

function findAnomalyPoints(
  records: DailyRecord[],
  metric: MetricName,
): MetricAnomalyPoint[] {
  const values = records
    .map((r) => ({ date: r.date, value: getMetricValue(r, metric) }))
    .filter((item): item is { date: string; value: number } => item.value !== undefined);

  if (values.length < 3) return [];

  const avg = average(values.map((v) => v.value));
  const stdDev = Math.sqrt(
    average(values.map((v) => Math.pow(v.value - avg, 2))),
  );

  const anomalies: MetricAnomalyPoint[] = [];
  const threshold = stdDev * 2;

  for (const item of values) {
    const deviation = Math.abs(item.value - avg);
    if (deviation > threshold) {
      anomalies.push({
        date: item.date,
        value: item.value,
        expectedRange: [Math.round((avg - threshold) * 10) / 10, Math.round((avg + threshold) * 10) / 10],
        description: `value ${Math.round(item.value * 10) / 10} deviates ${Math.round(deviation * 10) / 10} from mean ${Math.round(avg * 10) / 10}`,
      });
    }
  }

  return anomalies;
}

// ────────────────────────────────────────────
// 主函数：构建单个指标的 MetricSummary
// ────────────────────────────────────────────

export function buildMetricSummary(
  records: DailyRecord[],
  metric: MetricName,
  baselineValue?: number,
  evidencePrefix?: string,
): MetricSummary {
  const config = METRIC_CONFIG[metric];
  const values = records
    .map((r) => ({ date: r.date, value: getMetricValue(r, metric) }))
    .filter((item): item is { date: string; value: number } => item.value !== undefined);

  const missing = computeMissingCoverage(records, metric);
  const evidenceIds: string[] = [];
  const prefix = evidencePrefix ?? metric;

  // latest
  let latest: MetricValue | undefined;
  if (values.length > 0) {
    const last = values[values.length - 1]!;
    latest = { value: Math.round(last.value * 10) / 10, unit: config.unit, date: last.date };
    evidenceIds.push(`${prefix}_latest`);
  }

  // average
  let averageValue: MetricValue | undefined;
  if (values.length > 0) {
    const avg = Math.round(average(values.map((v) => v.value)) * 10) / 10;
    averageValue = { value: avg, unit: config.unit };
    evidenceIds.push(`${prefix}_avg`);
  }

  // min / max
  let min: MetricValue | undefined;
  let max: MetricValue | undefined;
  if (values.length > 0) {
    const sorted = [...values].sort((a, b) => a.value - b.value);
    min = { value: sorted[0]!.value, unit: config.unit, date: sorted[0]!.date };
    max = { value: sorted[sorted.length - 1]!.value, unit: config.unit, date: sorted[sorted.length - 1]!.date };
    evidenceIds.push(`${prefix}_min`, `${prefix}_max`);
  }

  // baseline & delta
  let baseline: MetricValue | undefined;
  let deltaPctVsBaseline: number | undefined;
  if (baselineValue !== undefined && values.length > 0) {
    baseline = { value: baselineValue, unit: config.unit };
    const reference = averageValue?.value ?? values[values.length - 1]!.value;
    deltaPctVsBaseline = Math.round(((reference - baselineValue) / baselineValue) * 100);
    evidenceIds.push(`${prefix}_baseline`);
  }

  // trend
  const trendDirection = computeTrendDirection(
    values.map((v) => v.value),
    config.trendThreshold,
  );
  if (trendDirection !== 'unknown') {
    evidenceIds.push(`${prefix}_trend`);
  }

  // anomalies
  const anomalyPoints = findAnomalyPoints(records, metric);
  for (const ap of anomalyPoints) {
    evidenceIds.push(`${prefix}_anomaly_${ap.date}`);
  }

  return {
    metric,
    latest,
    average: averageValue,
    min,
    max,
    baseline,
    deltaPctVsBaseline,
    trendDirection,
    anomalyPoints,
    missing,
    evidenceIds: [...new Set(evidenceIds)],
  };
}

// ────────────────────────────────────────────
// 批量构建
// ────────────────────────────────────────────

export function buildMetricSummaries(
  records: DailyRecord[],
  metrics: MetricName[],
  baselines?: Partial<Record<MetricName, number>>,
): MetricSummary[] {
  return metrics.map((m) => buildMetricSummary(records, m, baselines?.[m], m));
}

// ────────────────────────────────────────────
// Resting HR 专用 accessor（集中封装当前约定）
// ────────────────────────────────────────────

export function getRestingHR(record: DailyRecord): number | undefined {
  return METRIC_CONFIG['resting-hr'].field(record);
}
