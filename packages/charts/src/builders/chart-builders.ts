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
 * series key: 'hr'（DailyRecord.hr 是 number[]，经 normalizeTimeline 取均值后存储为 'hr'）
 */
export function buildRestingHr7Days(data: StandardTimeSeries): EChartsOption {
  const meta = CHART_TOKEN_META[ChartTokenId.RESTING_HR_7DAYS];
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

/**
 * 构建昨晚睡眠阶段图配置
 * 使用堆叠柱状图展示 deep/light/rem/awake 各阶段时长
 * series keys: 'sleep.stages.deep', 'sleep.stages.light', 'sleep.stages.rem', 'sleep.stages.awake'
 */
export function buildSleepStageLastNight(data: StandardTimeSeries): EChartsOption {
  const meta = CHART_TOKEN_META[ChartTokenId.SLEEP_STAGE_LAST_NIGHT];

  const stages = [
    { key: 'sleep.stages.deep', label: '深睡', color: '#312e81' },
    { key: 'sleep.stages.light', label: '浅睡', color: '#6366f1' },
    { key: 'sleep.stages.rem', label: 'REM', color: '#818cf8' },
    { key: 'sleep.stages.awake', label: '清醒', color: '#94a3b8' },
  ];

  return {
    ...DARK_THEME_BASE,
    title: { text: meta.label, textStyle: { color: '#f8fafc', fontSize: 14 } },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      textStyle: { color: '#f8fafc' },
    },
    xAxis: { type: 'category', data: data.dates, axisLabel: { color: '#64748b' } },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#64748b', formatter: '{value}分钟' },
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
 * series keys: 'hr'（取均值）, 'sleep.totalMinutes'（转小时）
 */
export function buildHrvSleep14DaysCompare(data: StandardTimeSeries): EChartsOption {
  const meta = CHART_TOKEN_META[ChartTokenId.HRV_SLEEP_14DAYS_COMPARE];

  const hrvData = data.series['hr'] ?? [];
  const sleepRaw = data.series['sleep.totalMinutes'] ?? [];
  const sleepHours = sleepRaw.map((v) => (v !== null ? Number((v / 60).toFixed(1)) : null));

  return {
    ...DARK_THEME_BASE,
    title: { text: meta.label, textStyle: { color: '#f8fafc', fontSize: 14 } },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      textStyle: { color: '#f8fafc' },
    },
    legend: {
      data: ['HRV', '睡眠'],
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
        name: '睡眠 (h)',
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
        name: '睡眠',
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
