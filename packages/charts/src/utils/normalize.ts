import type { TimelinePoint } from '@health-advisor/sandbox';

export interface StandardTimeSeries {
  dates: string[];
  series: Record<string, (number | null)[]>;
}

/**
 * 将 TimelinePoint 数组转换为标准时间序列格式
 * 自动从第一个数据点提取所有指标 key
 */
export function toTimeSeries(points: TimelinePoint[]): StandardTimeSeries {
  if (points.length === 0) return { dates: [], series: {} };

  const dates = points.map((p) => p.date);
  const firstValues = points[0]?.values ?? {};
  const metricKeys = Object.keys(firstValues);
  const series: Record<string, (number | null)[]> = {};

  for (const key of metricKeys) {
    series[key] = points.map((p) => p.values[key] ?? null);
  }

  return { dates, series };
}
