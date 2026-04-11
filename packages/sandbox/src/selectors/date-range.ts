import type { DailyRecord, Timeframe } from '@health-advisor/shared';
import { isDateInRange, timeframeToDateRange, type DateRange } from '@health-advisor/shared';

/**
 * 按日期范围过滤 DailyRecord
 */
export function selectByDateRange(records: DailyRecord[], range: DateRange): DailyRecord[] {
  return records.filter((record) => isDateInRange(record.date, range));
}

/**
 * 按时间窗口过滤 DailyRecord
 * @param records - 每日记录数组
 * @param timeframe - 时间窗口类型
 * @param referenceDate - 可选的参考日期（默认为今天）
 */
export function selectByTimeframe(
  records: DailyRecord[],
  timeframe: Timeframe,
  referenceDate?: string,
): DailyRecord[] {
  const range = timeframeToDateRange(timeframe, referenceDate);
  return selectByDateRange(records, range);
}
