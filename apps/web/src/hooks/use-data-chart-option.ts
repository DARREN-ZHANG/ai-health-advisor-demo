'use client';

import type { EChartsOption } from 'echarts';
import { useMemo } from 'react';
import type { DataTab, StressTimelineResponse } from '@health-advisor/shared';
import type { DataCenterResponse } from './use-data-query';

const tabColors: Record<string, string> = {
  hrv: '#8b5cf6',
  sleep: '#3b82f6',
  'resting-hr': '#ef4444',
  activity: '#10b981',
  spo2: '#06b6d4',
  stress: '#f59e0b',
};

export function useDataChartOption(
  tab: DataTab,
  data: DataCenterResponse | StressTimelineResponse | null | undefined
) {
  return useMemo<EChartsOption | null>(() => {
    if (!data) return null;

    const baseOption: EChartsOption = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: '#1e293b',
        borderColor: '#334155',
        textStyle: { color: '#f8fafc' },
      },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category' as const,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#64748b' },
      },
      yAxis: {
        type: 'value' as const,
        axisLine: { show: false },
        splitLine: { lineStyle: { color: '#1e293b' } },
        axisLabel: { color: '#64748b' },
      },
    };

    if (tab === 'stress') {
      const stressData = data as StressTimelineResponse;
      return {
        ...baseOption,
        xAxis: {
          ...(baseOption.xAxis as Record<string, unknown>),
          data: stressData.points.map(p => p.date),
        },
        yAxis: {
          ...(baseOption.yAxis as Record<string, unknown>),
          min: 0,
          max: 100,
        },
        series: [
          {
            name: '压力值',
            type: 'line' as const,
            smooth: true,
            data: stressData.points.map(p => p.stressLoadScore),
            itemStyle: { color: tabColors.stress },
            areaStyle: {
              color: {
                type: 'linear' as const,
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: `${tabColors.stress}4D` },
                  { offset: 1, color: `${tabColors.stress}00` }
                ]
              }
            }
          }
        ]
      };
    }

    const standardData = data as DataCenterResponse;
    const dates = standardData.timeline.map(p => p.date);
    const metric = standardData.metadata.metrics[0] || 'hr';
    let seriesData = standardData.timeline.map(p => p.values[metric]);

    // 特殊处理睡眠分钟转小时
    if (tab === 'sleep' && metric === 'sleep.totalMinutes') {
      seriesData = seriesData.map(v => (v != null) ? Number((v / 60).toFixed(1)) : null);
    }

    return {
      ...baseOption,
      xAxis: {
        ...(baseOption.xAxis as Record<string, unknown>),
        data: dates,
      },
      series: [
        {
          name: tab,
          type: 'line' as const,
          smooth: true,
          data: seriesData,
          itemStyle: { color: tabColors[tab] || '#3b82f6' },
          areaStyle: {
            color: {
              type: 'linear' as const,
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: `${tabColors[tab] || '#3b82f6'}4D` },
                { offset: 1, color: `${tabColors[tab] || '#3b82f6'}00` }
              ]
            }
          }
        }
      ]
    };
  }, [tab, data]);
}
