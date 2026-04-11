import { forwardRef, useEffect, useRef, useImperativeHandle } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, BarChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ChartRootProps } from './types';
import type { EChartsType } from 'echarts/core';

// 注册必要的组件（tree-shaking）
echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

export interface ChartRootRef {
  getInstance: () => EChartsType | null;
}

/**
 * ECharts React 封装组件
 * 支持自动 resize、option 响应式更新、ref 暴露实例
 */
export const ChartRoot = forwardRef<ChartRootRef, ChartRootProps>(function ChartRoot(
  { option, width = '100%', height = 300, className },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);

  useImperativeHandle(ref, () => ({
    getInstance: () => chartRef.current,
  }));

  // 初始化 chart 实例
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = echarts.init(container);
    chartRef.current = chart;
    chart.setOption(option);

    const observer = new ResizeObserver(() => {
      chart.resize();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
    // 仅在挂载时初始化（option 通过下面的 effect 更新）
  }, []);

  // option 变化时更新图表
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setOption(option, { notMerge: false });
  }, [option]);

  return <div ref={containerRef} style={{ width, height }} className={className} />;
});
