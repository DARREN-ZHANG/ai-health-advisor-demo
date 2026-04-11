import { ChartTokenId } from '../types/chart-token';
import { ChartTokenIdSchema } from '../schemas/chart-token';

export function parseChartTokenId(value: string): ChartTokenId | null {
  const result = ChartTokenIdSchema.safeParse(value);
  return result.success ? result.data : null;
}
