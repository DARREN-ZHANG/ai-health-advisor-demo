/** charts 包独立的时间线数据点接口，不依赖 sandbox */
export interface ChartDataPoint {
  date: string;
  values: Record<string, number | null>;
}

export interface StandardTimeSeries {
  dates: string[];
  series: Record<string, (number | null)[]>;
}

/**
 * 将 ChartDataPoint 数组转换为标准时间序列格式
 * 自动从第一个数据点提取所有指标 key
 */
export function toTimeSeries(points: ChartDataPoint[]): StandardTimeSeries {
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
