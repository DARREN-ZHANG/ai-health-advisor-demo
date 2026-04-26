import type { DailyRecord } from '@health-advisor/shared';
import type { MissingDataItem, MissingDataScope, MetricName } from './context-packet';
import type { EvidenceCollector } from './evidence-packet';
import { getMetricValue } from './metric-summary';

// ────────────────────────────────────────────
// 影响描述映射
// ────────────────────────────────────────────

const IMPACT_MAP: Record<string, Record<string, string>> = {
  sleep: {
    latest24h: 'cannot assess last-night sleep',
    selectedWindow: 'weekly sleep trend has partial missing data',
    trend7d: 'sleep trend calculation may be inaccurate',
    visibleChart: 'visible sleep chart has incomplete data',
  },
  hrv: {
    latest24h: 'cannot assess latest HRV status',
    selectedWindow: 'weekly HRV trend has partial missing data',
    trend7d: 'HRV trend calculation may be inaccurate',
    visibleChart: 'visible HRV chart has incomplete data',
  },
  'resting-hr': {
    latest24h: 'cannot assess latest resting heart rate',
    selectedWindow: 'weekly resting HR trend has partial missing data',
    trend7d: 'resting HR trend calculation may be inaccurate',
    visibleChart: 'visible resting HR chart has incomplete data',
  },
  activity: {
    latest24h: 'cannot assess latest activity level',
    selectedWindow: 'weekly activity trend has partial missing data',
    trend7d: 'activity trend calculation may be inaccurate',
    visibleChart: 'visible activity chart has incomplete data',
  },
  stress: {
    latest24h: 'cannot assess latest stress load',
    selectedWindow: 'weekly stress trend has partial missing data',
    trend7d: 'stress trend calculation may be inaccurate',
    visibleChart: 'visible stress chart has incomplete data',
  },
  spo2: {
    latest24h: 'cannot assess latest SpO2 level',
    selectedWindow: 'weekly SpO2 trend has partial missing data',
    trend7d: 'SpO2 trend calculation may be inaccurate',
    visibleChart: 'visible SpO2 chart has incomplete data',
  },
};

const DISCLOSURE_MAP: Record<string, Record<string, string>> = {
  sleep: {
    latest24h: '必须说明昨晚睡眠数据不足',
    selectedWindow: '必须说明当前窗口内睡眠数据部分缺失',
    trend7d: '必须说明本周睡眠趋势只有部分数据',
    visibleChart: '必须说明可见睡眠图表数据不完整',
  },
  hrv: {
    latest24h: '必须说明最新 HRV 数据不足',
    selectedWindow: '必须说明当前窗口内 HRV 数据部分缺失',
    trend7d: '必须说明本周 HRV 趋势只有部分数据',
    visibleChart: '必须说明可见 HRV 图表数据不完整',
  },
  'resting-hr': {
    latest24h: '必须说明最新静息心率数据不足',
    selectedWindow: '必须说明当前窗口内静息心率数据部分缺失',
    trend7d: '必须说明本周静息心率趋势只有部分数据',
    visibleChart: '必须说明可见静息心率图表数据不完整',
  },
  activity: {
    latest24h: '必须说明最新活动数据不足',
    selectedWindow: '必须说明当前窗口内活动数据部分缺失',
    trend7d: '必须说明本周活动趋势只有部分数据',
    visibleChart: '必须说明可见活动图表数据不完整',
  },
  stress: {
    latest24h: '必须说明最新压力数据不足',
    selectedWindow: '必须说明当前窗口内压力数据部分缺失',
    trend7d: '必须说明本周压力趋势只有部分数据',
    visibleChart: '必须说明可见压力图表数据不完整',
  },
  spo2: {
    latest24h: '必须说明最新血氧数据不足',
    selectedWindow: '必须说明当前窗口内血氧数据部分缺失',
    trend7d: '必须说明本周血氧趋势只有部分数据',
    visibleChart: '必须说明可见血氧图表数据不完整',
  },
};

// ────────────────────────────────────────────
// 查找最近可用日期
// 优先在 window records 中找，找不到则在全量 records 中找
// ────────────────────────────────────────────

export function findLastAvailableDate(
  records: DailyRecord[],
  metric: MetricName,
  allRecords?: DailyRecord[],
): string | undefined {
  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
  for (const r of sorted) {
    if (getMetricValue(r, metric) !== undefined) {
      return r.date;
    }
  }
  // 窗口内找不到，到全量记录中找
  if (allRecords && allRecords.length > 0) {
    const allSorted = [...allRecords].sort((a, b) => b.date.localeCompare(a.date));
    for (const r of allSorted) {
      if (getMetricValue(r, metric) !== undefined) {
        return r.date;
      }
    }
  }
  return undefined;
}

// ────────────────────────────────────────────
// 构建单个 scope 的缺失数据
// ────────────────────────────────────────────

export function buildMissingDataForScope(
  records: DailyRecord[],
  metric: MetricName,
  scope: MissingDataScope,
  evidence: EvidenceCollector,
  allRecords?: DailyRecord[],
): MissingDataItem | undefined {
  let targetRecords: DailyRecord[];

  switch (scope) {
    case 'latest24h':
      // 只检查最新一条记录
      targetRecords = records.length > 0 ? [records[records.length - 1]!] : [];
      break;
    case 'trend7d':
      // 检查最近最多 7 条记录
      targetRecords = records.slice(-7);
      break;
    case 'visibleChart':
      // visibleChart 的缺失与 selectedWindow 一致，但 scope 不同
      targetRecords = records;
      break;
    case 'selectedWindow':
    default:
      targetRecords = records;
      break;
  }

  const totalCount = targetRecords.length;
  if (totalCount === 0) return undefined;

  const missingCount = targetRecords.filter((r) => getMetricValue(r, metric) === undefined).length;
  if (missingCount === 0) return undefined;

  const evidenceId = `missing_${metric}_${scope}`;
  const dateRange = {
    start: targetRecords[0]?.date ?? '',
    end: targetRecords[targetRecords.length - 1]?.date ?? '',
  };

  evidence.addMissing(
    evidenceId,
    metric,
    scope,
    dateRange,
    `${missingCount}/${totalCount} records missing ${metric} in ${scope} scope`,
  );

  const lastAvailableDate = findLastAvailableDate(records, metric, allRecords);

  return {
    metric,
    scope,
    missingCount,
    totalCount,
    lastAvailableDate,
    impact: IMPACT_MAP[metric]?.[scope] ?? `${metric} data missing in ${scope}`,
    requiredDisclosure: DISCLOSURE_MAP[metric]?.[scope] ?? `必须说明${metric}数据不足`,
    evidenceId,
  };
}

// ────────────────────────────────────────────
// 构建全部缺失数据（支持多 scope）
// ────────────────────────────────────────────

export interface BuildMissingDataOptions {
  scopes?: MissingDataScope[];
  allRecords?: DailyRecord[];
  visibleChartMetrics?: MetricName[];
}

export function buildMissingDataPacket(
  records: DailyRecord[],
  metrics: MetricName[],
  evidence: EvidenceCollector,
  options?: BuildMissingDataOptions,
): MissingDataItem[] {
  const items: MissingDataItem[] = [];
  const scopes = options?.scopes ?? ['selectedWindow'];
  const allRecords = options?.allRecords;
  const visibleChartMetrics = options?.visibleChartMetrics ?? metrics;

  for (const scope of scopes) {
    // visibleChart scope 只检查当前可见图表对应的 metric
    const targetMetrics = scope === 'visibleChart' ? visibleChartMetrics : metrics;
    for (const metric of targetMetrics) {
      const item = buildMissingDataForScope(records, metric, scope, evidence, allRecords);
      if (item) items.push(item);
    }
  }

  return items;
}

// ────────────────────────────────────────────
// 针对特定 scope 构建（保留向后兼容）
// ────────────────────────────────────────────

export function buildMissingDataForScopes(
  records: DailyRecord[],
  metrics: MetricName[],
  scopes: MissingDataScope[],
  evidence: EvidenceCollector,
  allRecords?: DailyRecord[],
): MissingDataItem[] {
  return buildMissingDataPacket(records, metrics, evidence, { scopes, allRecords });
}
