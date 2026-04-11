import { z } from 'zod';
import { ChartTokenId } from '../types/chart-token';

export const ChartTokenIdSchema = z.nativeEnum(ChartTokenId);

export const CHART_TOKEN_IDS = Object.values(ChartTokenId) as string[];

export function isValidChartTokenId(value: string): value is ChartTokenId {
  return CHART_TOKEN_IDS.includes(value);
}
