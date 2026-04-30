import type { EChartsOption } from 'echarts';
import { ChartTokenId, CHART_TOKEN_META, localize, DEFAULT_LOCALE } from '@health-advisor/shared';
import type { StandardTimeSeries } from '../utils/normalize';
import { DARK_THEME_BASE, lineSeries } from './theme';

/** 图表构建器的可选翻译参数 */
export interface ChartBuilderOptions {
  label?: string;
  unit?: string;
}

/** 将 meta 中的 label 和 unit 展平，优先使用 options 传入的翻译值 */
function flatMeta(id: ChartTokenId, options?: ChartBuilderOptions) {
  const meta = CHART_TOKEN_META[id];
  return {
    label: options?.label ?? localize(meta.label, DEFAULT_LOCALE),
    unit: options?.unit ?? localize(meta.unit, DEFAULT_LOCALE),
    color: meta.color,
  };
}

/**
 * 构建最近7天 HRV 趋势图配置
 * series key: 'hrv'
 */
export function buildHrv7Days(data: StandardTimeSeries, options?: ChartBuilderOptions): EChartsOption {
  const { label, unit, color } = flatMeta(ChartTokenId.HRV_7DAYS, options);
  const seriesData = data.series['hrv'] ?? [];

  return {
    ...DARK_THEME_BASE,
    title: { text: label, textStyle: { color: '#f8fafc', fontSize: 14 } },
    xAxis: { type: 'category', data: data.dates, axisLabel: { color: '#64748b' } },
    yAxis: { type: 'value', axisLabel: { color: '#64748b', formatter: `{value}${unit}` } },
    series: [lineSeries(label, seriesData, color)],
  };
}

/**
 * 构建最近7天睡眠趋势图配置
 * series key: 'sleep.totalMinutes'（转换为小时）
 */
export function buildSleep7Days(data: StandardTimeSeries, options?: ChartBuilderOptions): EChartsOption {
  const { label, unit, color } = flatMeta(ChartTokenId.SLEEP_7DAYS, options);
  const raw = data.series['sleep.totalMinutes'] ?? [];
  // 将分钟转换为小时
  const seriesData = raw.map((v) => (v !== null ? Number((v / 60).toFixed(1)) : null));

  return {
    ...DARK_THEME_BASE,
    title: { text: label, textStyle: { color: '#f8fafc', fontSize: 14 } },
    xAxis: { type: 'category', data: data.dates, axisLabel: { color: '#64748b' } },
    yAxis: { type: 'value', axisLabel: { color: '#64748b', formatter: `{value}${unit}` } },
    series: [lineSeries(label, seriesData, color)],
  };
}

/**
 * 构建最近7天静息心率图配置
 * series key: 'hr'（DailyRecord.hr 是 number[]，经 normalizeTimeline 取均值后存储为 'hr'）
 */
export function buildRestingHr7Days(data: StandardTimeSeries, options?: ChartBuilderOptions): EChartsOption {
  const { label, unit, color } = flatMeta(ChartTokenId.RESTING_HR_7DAYS, options);
  const seriesData = data.series['hr'] ?? [];

  return {
    ...DARK_THEME_BASE,
    title: { text: label, textStyle: { color: '#f8fafc', fontSize: 14 } },
    xAxis: { type: 'category', data: data.dates, axisLabel: { color: '#64748b' } },
    yAxis: { type: 'value', axisLabel: { color: '#64748b', formatter: `{value}${unit}` } },
    series: [lineSeries(label, seriesData, color)],
  };
}

/**
 * 构建最近7天活动趋势图配置
 * series key: 'activity.steps'
 */
export function buildActivity7Days(data: StandardTimeSeries, options?: ChartBuilderOptions): EChartsOption {
  const { label, unit, color } = flatMeta(ChartTokenId.ACTIVITY_7DAYS, options);
  const seriesData = data.series['activity.steps'] ?? [];

  return {
    ...DARK_THEME_BASE,
    grid: { ...DARK_THEME_BASE.grid, left: 70 },
    title: { text: label, textStyle: { color: '#f8fafc', fontSize: 14 } },
    xAxis: { type: 'category', data: data.dates, axisLabel: { color: '#64748b' } },
    yAxis: { type: 'value', axisLabel: { color: '#64748b', formatter: `{value}${unit}` } },
    series: [lineSeries(label, seriesData, color)],
  };
}

/**
 * 构建最近7天血氧趋势图配置
 * series key: 'spo2'，yAxis 固定 min:85 max:100
 */
export function buildSpo27Days(data: StandardTimeSeries, options?: ChartBuilderOptions): EChartsOption {
  const { label, unit, color } = flatMeta(ChartTokenId.SPO2_7DAYS, options);
  const seriesData = data.series['spo2'] ?? [];

  return {
    ...DARK_THEME_BASE,
    title: { text: label, textStyle: { color: '#f8fafc', fontSize: 14 } },
    xAxis: { type: 'category', data: data.dates, axisLabel: { color: '#64748b' } },
    yAxis: {
      type: 'value',
      min: 85,
      max: 100,
      axisLabel: { color: '#64748b', formatter: `{value}${unit}` },
    },
    series: [lineSeries(label, seriesData, color)],
  };
}

/**
 * 构建最近7天压力负荷图配置
 * series key: 'stress.load'，yAxis 固定 min:0 max:100
 */
export function buildStressLoad7Days(data: StandardTimeSeries, options?: ChartBuilderOptions): EChartsOption {
  const { label, unit, color } = flatMeta(ChartTokenId.STRESS_LOAD_7DAYS, options);
  const seriesData = data.series['stress.load'] ?? [];

  return {
    ...DARK_THEME_BASE,
    title: { text: label, textStyle: { color: '#f8fafc', fontSize: 14 } },
    xAxis: { type: 'category', data: data.dates, axisLabel: { color: '#64748b' } },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { color: '#64748b', formatter: `{value}${unit}` },
    },
    series: [lineSeries(label, seriesData, color)],
  };
}

/**
 * 构建昨晚睡眠阶段图配置
 * 使用堆叠柱状图展示 deep/light/rem/awake 各阶段时长
 * series keys: 'sleep.stages.deep', 'sleep.stages.light', 'sleep.stages.rem', 'sleep.stages.awake'
 */
export function buildSleepStageLastNight(data: StandardTimeSeries, options?: ChartBuilderOptions): EChartsOption {
  const { label, unit } = flatMeta(ChartTokenId.SLEEP_STAGE_LAST_NIGHT, options);

  const stages = [
    { key: 'sleep.stages.deep', label: 'Deep', color: '#312e81' },
    { key: 'sleep.stages.light', label: 'Light', color: '#6366f1' },
    { key: 'sleep.stages.rem', label: 'REM', color: '#818cf8' },
    { key: 'sleep.stages.awake', label: 'Awake', color: '#94a3b8' },
  ];

  return {
    ...DARK_THEME_BASE,
    title: { text: label, textStyle: { color: '#f8fafc', fontSize: 14 } },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      textStyle: { color: '#f8fafc' },
    },
    xAxis: { type: 'category', data: data.dates, axisLabel: { color: '#64748b' } },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#64748b', formatter: `{value}${unit}` },
    },
    series: stages.map((stage) => ({
      name: stage.label,
      type: 'bar' as const,
      stack: 'sleep',
      data: data.series[stage.key] ?? [],
      itemStyle: { color: stage.color },
      barWidth: '60%',
    })),
  };
}

/**
 * 构建 HRV-睡眠14天对比图配置
 * 双 Y 轴折线图：左轴 HRV (ms)，右轴睡眠 (h)
 * series keys: 'hrv', 'sleep.totalMinutes'（转小时）
 */
export function buildHrvSleep14DaysCompare(data: StandardTimeSeries, options?: ChartBuilderOptions): EChartsOption {
  const { label } = flatMeta(ChartTokenId.HRV_SLEEP_14DAYS_COMPARE, options);

  const hrvData = data.series['hrv'] ?? [];
  const sleepRaw = data.series['sleep.totalMinutes'] ?? [];
  const sleepHours = sleepRaw.map((v) => (v !== null ? Number((v / 60).toFixed(1)) : null));

  return {
    ...DARK_THEME_BASE,
    title: { text: label, textStyle: { color: '#f8fafc', fontSize: 14 } },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      textStyle: { color: '#f8fafc' },
    },
    legend: {
      data: ['HRV', 'Sleep'],
      textStyle: { color: '#94a3b8' },
      top: 0,
      right: 0,
    },
    xAxis: { type: 'category', data: data.dates, axisLabel: { color: '#64748b' } },
    yAxis: [
      {
        type: 'value',
        name: 'HRV (ms)',
        nameTextStyle: { color: '#94a3b8' },
        axisLabel: { color: '#64748b', formatter: '{value}ms' },
      },
      {
        type: 'value',
        name: 'Sleep (h)',
        nameTextStyle: { color: '#94a3b8' },
        axisLabel: { color: '#64748b', formatter: '{value}h' },
      },
    ],
    series: [
      {
        name: 'HRV',
        type: 'line',
        yAxisIndex: 0,
        data: hrvData,
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: { color: '#8b5cf6', width: 2 },
        itemStyle: { color: '#8b5cf6' },
        areaStyle: { color: '#8b5cf6', opacity: 0.1 },
      },
      {
        name: 'Sleep',
        type: 'line',
        yAxisIndex: 1,
        data: sleepHours,
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: { color: '#3b82f6', width: 2 },
        itemStyle: { color: '#3b82f6' },
        areaStyle: { color: '#3b82f6', opacity: 0.1 },
      },
    ],
  };
}
