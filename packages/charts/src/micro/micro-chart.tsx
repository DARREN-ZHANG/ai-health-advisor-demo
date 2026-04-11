import { forwardRef } from 'react';
import { ChartRoot, type ChartRootRef } from '../core/chart-root';
import type { ChartRootProps } from '../core/types';

export interface MicroChartProps extends Omit<ChartRootProps, 'height'> {
  height?: string | number;
}

/**
 * 微型图表组件
 * 默认高度 80px，用于仪表板中的迷你预览
 */
export const MicroChart = forwardRef<ChartRootRef, MicroChartProps>(function MicroChart(
  { height = 80, ...rest },
  ref,
) {
  return <ChartRoot ref={ref} height={height} {...rest} />;
});
