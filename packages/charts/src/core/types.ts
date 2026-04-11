import type { EChartsOption } from 'echarts';

export interface ChartRootProps {
  option: EChartsOption;
  width?: string | number;
  height?: string | number;
  className?: string;
}
