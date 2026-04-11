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
 * @param timeframe - 时间窗口类型（支持 day/week/month/year/custom）
 * @param options - 可选参数：referenceDate 参考日期，customDateRange 自定义日期范围（timeframe 为 custom 时必填）
 */
export function selectByTimeframe(
  records: DailyRecord[],
  timeframe: Timeframe,
  options?: { referenceDate?: string; customDateRange?: DateRange },
): DailyRecord[] {
  const range = timeframeToDateRange(timeframe, options?.referenceDate, options?.customDateRange);
  return selectByDateRange(records, range);
}
