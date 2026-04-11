import type { Timeframe } from '../types/agent';

export interface TimeframeConfig {
  label: string;
  days: number;
}

export const TIMEFRAME_CONFIGS: Record<Exclude<Timeframe, 'custom'>, TimeframeConfig> = {
  day: { label: '今日', days: 1 },
  week: { label: '近 7 天', days: 7 },
  month: { label: '近 30 天', days: 30 },
  year: { label: '近一年', days: 365 },
};

/** custom 时间窗没有固定天数配置 */
export const CUSTOM_TIMEFRAME_LABEL = '自定义';
