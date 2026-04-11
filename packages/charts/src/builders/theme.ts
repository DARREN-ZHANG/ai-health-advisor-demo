import type { EChartsOption } from 'echarts';

/** 暗色主题基础配置 */
export const DARK_THEME_BASE: Partial<EChartsOption> = {
  backgroundColor: 'transparent',
  textStyle: {
    color: '#94a3b8',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  grid: { left: 50, right: 20, top: 30, bottom: 30 },
  tooltip: {
    trigger: 'axis',
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    textStyle: { color: '#f8fafc' },
  },
};

/**
 * 创建折线系列配置
 */
export function lineSeries(name: string, data: (number | null)[], color: string) {
  return {
    name,
    type: 'line' as const,
    data,
    smooth: true,
    symbol: 'circle',
    symbolSize: 4,
    lineStyle: { color, width: 2 },
    itemStyle: { color },
    areaStyle: { color, opacity: 0.1 },
  };
}
