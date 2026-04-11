import type { PageContext, Timeframe } from '../types/agent';
import { PageContextSchema } from '../schemas/agent';

export function createPageContext(
  profileId: string,
  page: string,
  timeframe: Timeframe = 'week',
  dataTab?: string,
): PageContext {
  const ctx: PageContext = {
    profileId,
    page,
    timeframe,
    ...(dataTab ? { dataTab: dataTab as PageContext['dataTab'] } : {}),
  };
  return PageContextSchema.parse(ctx);
}
