import type { DailyRecord } from '@health-advisor/shared';

/**
 * 检测记录中缺失比例超过 50% 的指标字段。
 */
export function detectMissingFields(
  records: DailyRecord[],
  metrics: readonly string[],
): string[] {
  if (records.length === 0) return [...metrics];

  const threshold = records.length / 2;
  const missing: string[] = [];

  for (const metric of metrics) {
    const presentCount = records.filter((r) => {
      const value = getNestedValue(r as unknown as Record<string, unknown>, metric);
      return value !== undefined && value !== null;
    }).length;

    if (presentCount < threshold) {
      missing.push(metric);
    }
  }

  return missing;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
