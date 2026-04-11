import type { Timeframe } from '../types/agent';
import { TIMEFRAME_CONFIGS } from '../constants/timeframes';
import { getDateRange, type DateRange } from './date-range';

export function timeframeToDateRange(timeframe: Timeframe, referenceDate?: string): DateRange {
  const config = TIMEFRAME_CONFIGS[timeframe];
  return getDateRange(config.days, referenceDate);
}
