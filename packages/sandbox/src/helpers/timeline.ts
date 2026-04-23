import type { DailyRecord } from '@health-advisor/shared';

/** 时间线上的单个数据点 */
export interface TimelinePoint {
  date: string;
  values: Record<string, number | null>;
}

/**
 * 从 DailyRecord 数组提取指定指标，生成时间线数据
 * 支持点号路径访问嵌套字段（如 'sleep.score', 'stress.load'）
 *
 * @param records - 每日记录数组
 * @param metrics - 要提取的指标路径列表
 * @returns TimelinePoint 数组
 */
export function normalizeTimeline(records: DailyRecord[], metrics: string[]): TimelinePoint[] {
  return records.map((record) => {
    const values: Record<string, number | null> = {};

    for (const metric of metrics) {
      values[metric] = extractMetricValue(record, metric);
    }

    return { date: record.date, values };
  });
}

/**
 * 计算滚动中位数
 * 用于 stress load 等指标的平滑处理
 *
 * @param values - 数值数组（null 视为缺失值）
 * @param windowSize - 滑动窗口大小（必须为正奇数）
 * @returns 滚动中位数数组（两端不足窗口部分用已有数据计算）
 */
export function rollingMedian(
  values: (number | null)[],
  windowSize: number = 7,
): (number | null)[] {
  if (windowSize < 1) return values.map(() => null);
  if (values.length === 0) return [];

  const half = Math.floor(windowSize / 2);

  return values.map((_, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(values.length, i + half + 1);
    const window = values.slice(start, end).filter((v): v is number => v !== null);

    if (window.length === 0) return null;

    const sorted = [...window].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    return sorted.length % 2 === 0
      ? (sorted[mid - 1]! + sorted[mid]!) / 2
      : sorted[mid]!;
  });
}

/**
 * 从 DailyRecord 的 intraday 数据提取指定指标，生成分时时间线
 * 每个快照对应一个2小时窗口
 *
 * @param records - 每日记录数组（通常仅包含1天）
 * @param metrics - 要提取的指标路径列表
 * @returns TimelinePoint 数组，date 为小时标签（如 "00:00"）
 */
export function normalizeIntradayTimeline(
  records: DailyRecord[],
  metrics: string[],
): TimelinePoint[] {
  // intraday 数据通常只在单条记录中
  const record = records.find((r) => r.intraday && r.intraday.length > 0);
  const snapshots = record?.intraday ?? [];

  return snapshots.map((snapshot) => {
    const values: Record<string, number | null> = {};
    for (const metric of metrics) {
      values[metric] = extractIntradayMetric(snapshot, metric);
    }
    return { date: `${String(snapshot.hour).padStart(2, '0')}:00`, values };
  });
}

/**
 * 从 IntradaySnapshot 中提取指标值
 * 支持将日级指标路径映射到快照字段
 */
function extractIntradayMetric(
  snapshot: NonNullable<DailyRecord['intraday']>[number],
  metricPath: string,
): number | null {
  const mapping: Record<string, keyof typeof snapshot> = {
    hr: 'hr',
    'sleep.totalMinutes': 'sleepMinutes',
    'activity.steps': 'steps',
    spo2: 'spo2',
    'stress.load': 'stressLoad',
  };

  const key = mapping[metricPath];
  if (key && snapshot[key] !== undefined) {
    return snapshot[key] as number;
  }

  // 回退：尝试直接从快照中按路径提取
  const parts = metricPath.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = snapshot;
  for (const part of parts) {
    if (current === null || current === undefined) return null;
    current = current[part];
  }
  return typeof current === 'number' ? current : null;
}

/**
 * 从 DailyRecord 中提取指定路径的数值
 * 支持点号路径（如 'sleep.score'）
 */
function extractMetricValue(record: DailyRecord, metricPath: string): number | null {
  const parts = metricPath.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = record;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return null;
    }
    current = current[part];
  }

  if (current === null || current === undefined) {
    return null;
  }

  if (typeof current === 'number') {
    return current;
  }

  // 处理 number[] 类型字段（如 hr），取均值
  if (Array.isArray(current) && current.length > 0 && typeof current[0] === 'number') {
    const nums = current as number[];
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  return null;
}
