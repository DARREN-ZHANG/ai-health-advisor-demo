import { ChartTokenId } from '../types/chart-token';

export interface ChartTokenMeta {
  id: ChartTokenId;
  label: string;
  unit: string;
  color: string;
}

export const CHART_TOKEN_META: Record<ChartTokenId, ChartTokenMeta> = {
  [ChartTokenId.HRV_7DAYS]: { id: ChartTokenId.HRV_7DAYS, label: 'HRV 趋势', unit: 'ms', color: '#8b5cf6' },
  [ChartTokenId.SLEEP_7DAYS]: { id: ChartTokenId.SLEEP_7DAYS, label: '睡眠趋势', unit: 'h', color: '#3b82f6' },
  [ChartTokenId.RESTING_HR_7DAYS]: { id: ChartTokenId.RESTING_HR_7DAYS, label: '静息心率', unit: 'bpm', color: '#ef4444' },
  [ChartTokenId.ACTIVITY_7DAYS]: { id: ChartTokenId.ACTIVITY_7DAYS, label: '活动趋势', unit: '步', color: '#22c55e' },
  [ChartTokenId.SPO2_7DAYS]: { id: ChartTokenId.SPO2_7DAYS, label: '血氧趋势', unit: '%', color: '#06b6d4' },
  [ChartTokenId.SLEEP_STAGE_LAST_NIGHT]: { id: ChartTokenId.SLEEP_STAGE_LAST_NIGHT, label: '昨晚睡眠阶段', unit: '', color: '#6366f1' },
  [ChartTokenId.STRESS_LOAD_7DAYS]: { id: ChartTokenId.STRESS_LOAD_7DAYS, label: '压力负荷', unit: '分', color: '#f97316' },
  [ChartTokenId.HRV_SLEEP_14DAYS_COMPARE]: { id: ChartTokenId.HRV_SLEEP_14DAYS_COMPARE, label: 'HRV-睡眠对比', unit: '', color: '#a855f7' },
};

export function getChartTokenMeta(id: ChartTokenId): ChartTokenMeta {
  return CHART_TOKEN_META[id];
}
