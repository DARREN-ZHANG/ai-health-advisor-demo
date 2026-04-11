import type { EChartsOption } from 'echarts';
import { ChartTokenId } from '@health-advisor/shared';
import type { StandardTimeSeries } from '../utils/normalize';
import {
  buildHrv7Days,
  buildSleep7Days,
  buildRestingHr7Days,
  buildActivity7Days,
  buildSpo27Days,
  buildStressLoad7Days,
  buildSleepStageLastNight,
  buildHrvSleep14DaysCompare,
} from '../builders/chart-builders';

export type ChartBuilder = (data: StandardTimeSeries) => EChartsOption;

/**
 * ChartTokenId -> Builder 映射注册表
 */
const registry: Record<ChartTokenId, ChartBuilder> = {
  [ChartTokenId.HRV_7DAYS]: buildHrv7Days,
  [ChartTokenId.SLEEP_7DAYS]: buildSleep7Days,
  [ChartTokenId.RESTING_HR_7DAYS]: buildRestingHr7Days,
  [ChartTokenId.ACTIVITY_7DAYS]: buildActivity7Days,
  [ChartTokenId.SPO2_7DAYS]: buildSpo27Days,
  [ChartTokenId.STRESS_LOAD_7DAYS]: buildStressLoad7Days,
  [ChartTokenId.SLEEP_STAGE_LAST_NIGHT]: buildSleepStageLastNight,
  [ChartTokenId.HRV_SLEEP_14DAYS_COMPARE]: buildHrvSleep14DaysCompare,
};

/**
 * 根据 tokenId 获取对应的图表构建器
 */
export function getChartBuilder(tokenId: ChartTokenId): ChartBuilder | undefined {
  return registry[tokenId];
}
