import type { PageContext, Timeframe } from '../types/agent';
import { PageContextSchema } from '../schemas/agent';
import type { DateRange } from './date-range';

export function createPageContext(
  profileId: string,
  page: string,
  timeframe: Timeframe = 'week',
  dataTab?: string,
  customDateRange?: DateRange,
): PageContext {
  const ctx: PageContext = {
    profileId,
    page,
    timeframe,
    ...(dataTab ? { dataTab: dataTab as PageContext['dataTab'] } : {}),
    ...(timeframe === 'custom' && customDateRange ? { customDateRange } : {}),
  };
  return PageContextSchema.parse(ctx);
}
