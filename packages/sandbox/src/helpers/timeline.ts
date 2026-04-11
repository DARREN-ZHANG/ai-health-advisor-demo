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

  return null;
}
