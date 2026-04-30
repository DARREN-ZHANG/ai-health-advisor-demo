import { ChartTokenId } from '../types/chart-token';
import type { LocalizableText } from '../types/locale';

export interface ChartTokenMeta {
  id: ChartTokenId;
  label: LocalizableText;
  unit: LocalizableText;
  color: string;
}

export const CHART_TOKEN_META: Record<ChartTokenId, ChartTokenMeta> = {
  [ChartTokenId.HRV_7DAYS]: {
    id: ChartTokenId.HRV_7DAYS,
    label: { zh: 'HRV 趋势', en: 'HRV Trend' },
    unit: { zh: 'ms', en: 'ms' },
    color: '#8b5cf6',
  },
  [ChartTokenId.SLEEP_7DAYS]: {
    id: ChartTokenId.SLEEP_7DAYS,
    label: { zh: '睡眠趋势', en: 'Sleep Trend' },
    unit: { zh: 'h', en: 'h' },
    color: '#3b82f6',
  },
  [ChartTokenId.RESTING_HR_7DAYS]: {
    id: ChartTokenId.RESTING_HR_7DAYS,
    label: { zh: '静息心率', en: 'Resting HR' },
    unit: { zh: 'bpm', en: 'bpm' },
    color: '#ef4444',
  },
  [ChartTokenId.ACTIVITY_7DAYS]: {
    id: ChartTokenId.ACTIVITY_7DAYS,
    label: { zh: '活动趋势', en: 'Activity Trend' },
    unit: { zh: '步', en: 'steps' },
    color: '#22c55e',
  },
  [ChartTokenId.SPO2_7DAYS]: {
    id: ChartTokenId.SPO2_7DAYS,
    label: { zh: '血氧趋势', en: 'SpO2 Trend' },
    unit: { zh: '%', en: '%' },
    color: '#06b6d4',
  },
  [ChartTokenId.SLEEP_STAGE_LAST_NIGHT]: {
    id: ChartTokenId.SLEEP_STAGE_LAST_NIGHT,
    label: { zh: '昨晚睡眠阶段', en: 'Last Night Sleep Stages' },
    unit: { zh: '', en: '' },
    color: '#6366f1',
  },
  [ChartTokenId.STRESS_LOAD_7DAYS]: {
    id: ChartTokenId.STRESS_LOAD_7DAYS,
    label: { zh: '压力负荷', en: 'Stress Load' },
    unit: { zh: '分', en: 'pts' },
    color: '#f97316',
  },
  [ChartTokenId.HRV_SLEEP_14DAYS_COMPARE]: {
    id: ChartTokenId.HRV_SLEEP_14DAYS_COMPARE,
    label: { zh: 'HRV-睡眠对比', en: 'HRV-Sleep Comparison' },
    unit: { zh: '', en: '' },
    color: '#a855f7',
  },
};

export function getChartTokenMeta(id: ChartTokenId): ChartTokenMeta {
  return CHART_TOKEN_META[id];
}
