import type { EChartsOption } from 'echarts';
import { ChartTokenId, CHART_TOKEN_META } from '@health-advisor/shared';
import type { StandardTimeSeries } from '../utils/normalize';
import { DARK_THEME_BASE, lineSeries } from './theme';

/**
 * 构建最近7天 HRV 趋势图配置
 * series key: 'hr'（取 hr 数组平均值）
 */
export function buildHrv7Days(data: StandardTimeSeries): EChartsOption {
  const meta = CHART_TOKEN_META[ChartTokenId.HRV_7DAYS];
  const seriesData = data.series['hr'] ?? [];

  return {
    ...DARK_THEME_BASE,
    title: { text: meta.label, textStyle: { color: '#f8fafc', fontSize: 14 } },
    xAxis: { type: 'category', data: data.dates, axisLabel: { color: '#64748b' } },
    yAxis: { type: 'value', axisLabel: { color: '#64748b', formatter: `{value}${meta.unit}` } },
    series: [lineSeries(meta.label, seriesData, meta.color)],
  };
}

/**
 * 构建最近7天睡眠趋势图配置
 * series key: 'sleep.totalMinutes'（转换为小时）
 */
export function buildSleep7Days(data: StandardTimeSeries): EChartsOption {
  const meta = CHART_TOKEN_META[ChartTokenId.SLEEP_7DAYS];
  const raw = data.series['sleep.totalMinutes'] ?? [];
  // 将分钟转换为小时
  const seriesData = raw.map((v) => (v !== null ? Number((v / 60).toFixed(1)) : null));

  return {
    ...DARK_THEME_BASE,
    title: { text: meta.label, textStyle: { color: '#f8fafc', fontSize: 14 } },
    xAxis: { type: 'category', data: data.dates, axisLabel: { color: '#64748b' } },
    yAxis: { type: 'value', axisLabel: { color: '#64748b', formatter: `{value}${meta.unit}` } },
    series: [lineSeries(meta.label, seriesData, meta.color)],
  };
}

/**
 * 构建最近7天静息心率图配置
 * series key: 'hr.resting'
 */
export function buildRestingHr7Days(data: StandardTimeSeries): EChartsOption {
  const meta = CHART_TOKEN_META[ChartTokenId.RESTING_HR_7DAYS];
  const seriesData = data.series['hr.resting'] ?? [];

  return {
    ...DARK_THEME_BASE,
    title: { text: meta.label, textStyle: { color: '#f8fafc', fontSize: 14 } },
    xAxis: { type: 'category', data: data.dates, axisLabel: { color: '#64748b' } },
    yAxis: { type: 'value', axisLabel: { color: '#64748b', formatter: `{value}${meta.unit}` } },
    series: [lineSeries(meta.label, seriesData, meta.color)],
  };
}

/**
 * 构建最近7天活动趋势图配置
 * series key: 'activity.steps'
 */
export function buildActivity7Days(data: StandardTimeSeries): EChartsOption {
  const meta = CHART_TOKEN_META[ChartTokenId.ACTIVITY_7DAYS];
  const seriesData = data.series['activity.steps'] ?? [];

  return {
    ...DARK_THEME_BASE,
    title: { text: meta.label, textStyle: { color: '#f8fafc', fontSize: 14 } },
    xAxis: { type: 'category', data: data.dates, axisLabel: { color: '#64748b' } },
    yAxis: { type: 'value', axisLabel: { color: '#64748b', formatter: `{value}${meta.unit}` } },
    series: [lineSeries(meta.label, seriesData, meta.color)],
  };
}

/**
 * 构建最近7天血氧趋势图配置
 * series key: 'spo2'，yAxis 固定 min:85 max:100
 */
export function buildSpo27Days(data: StandardTimeSeries): EChartsOption {
  const meta = CHART_TOKEN_META[ChartTokenId.SPO2_7DAYS];
  const seriesData = data.series['spo2'] ?? [];

  return {
    ...DARK_THEME_BASE,
    title: { text: meta.label, textStyle: { color: '#f8fafc', fontSize: 14 } },
    xAxis: { type: 'category', data: data.dates, axisLabel: { color: '#64748b' } },
    yAxis: {
      type: 'value',
      min: 85,
      max: 100,
      axisLabel: { color: '#64748b', formatter: `{value}${meta.unit}` },
    },
    series: [lineSeries(meta.label, seriesData, meta.color)],
  };
}

/**
 * 构建最近7天压力负荷图配置
 * series key: 'stress.load'，yAxis 固定 min:0 max:100
 */
export function buildStressLoad7Days(data: StandardTimeSeries): EChartsOption {
  const meta = CHART_TOKEN_META[ChartTokenId.STRESS_LOAD_7DAYS];
  const seriesData = data.series['stress.load'] ?? [];

  return {
    ...DARK_THEME_BASE,
    title: { text: meta.label, textStyle: { color: '#f8fafc', fontSize: 14 } },
    xAxis: { type: 'category', data: data.dates, axisLabel: { color: '#64748b' } },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { color: '#64748b', formatter: `{value}${meta.unit}` },
    },
    series: [lineSeries(meta.label, seriesData, meta.color)],
  };
}
