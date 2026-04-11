import type { Timeframe } from '../types/agent';

export interface TimeframeConfig {
  label: string;
  days: number;
}

export const TIMEFRAME_CONFIGS: Record<Timeframe, TimeframeConfig> = {
  day: { label: '今日', days: 1 },
  week: { label: '近 7 天', days: 7 },
  month: { label: '近 30 天', days: 30 },
  year: { label: '近一年', days: 365 },
};
