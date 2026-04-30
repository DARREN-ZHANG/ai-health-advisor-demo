import type { Timeframe } from '../types/agent';
import type { LocalizableText } from '../types/locale';

export interface TimeframeConfig {
  label: LocalizableText;
  days: number;
}

export const TIMEFRAME_CONFIGS: Record<Exclude<Timeframe, 'custom'>, TimeframeConfig> = {
  day: { label: { zh: '今日', en: 'Today' }, days: 1 },
  week: { label: { zh: '近 7 天', en: 'Last 7 Days' }, days: 7 },
  month: { label: { zh: '近 30 天', en: 'Last 30 Days' }, days: 30 },
  year: { label: { zh: '近一年', en: 'Last Year' }, days: 365 },
};

/** custom 时间窗没有固定天数配置 */
export const CUSTOM_TIMEFRAME_LABEL: LocalizableText = { zh: '自定义', en: 'Custom' };
