import { getDateRange } from '@health-advisor/shared';
import type { InternalTaskType } from '../types/internal-task-type';
import { resolveTaskRoute } from '../routing/task-router';

export function selectWindowByTask(
  taskType: InternalTaskType,
  referenceDate?: string,
  timeframe?: import('@health-advisor/shared').Timeframe,
  customDateRange?: { start: string; end: string },
): { start: string; end: string } {
  const route = resolveTaskRoute(taskType);

  // view_summary 使用请求中的 timeframe
  if (route.windowDays === 0) {
    const tf = timeframe ?? 'week';
    if (tf === 'custom' && customDateRange) {
      return customDateRange;
    }
    const configMap: Record<string, number> = {
      day: 1,
      week: 7,
      month: 30,
      year: 365,
    };
    const config = configMap[tf] ?? 7;
    return getDateRange(config, referenceDate);
  }

  return getDateRange(route.windowDays, referenceDate);
}
