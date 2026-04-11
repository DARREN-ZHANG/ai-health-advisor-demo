import { describe, it, expect } from 'vitest';
import { ChartTokenId } from '@health-advisor/shared';
import { getChartBuilder } from '../registry/token-registry';

const registeredTokens = [
  ChartTokenId.HRV_7DAYS,
  ChartTokenId.SLEEP_7DAYS,
  ChartTokenId.RESTING_HR_7DAYS,
  ChartTokenId.ACTIVITY_7DAYS,
  ChartTokenId.SPO2_7DAYS,
  ChartTokenId.STRESS_LOAD_7DAYS,
];

describe('token-registry', () => {
  it('已注册的 token 都能获取到 builder 函数', () => {
    for (const tokenId of registeredTokens) {
      const builder = getChartBuilder(tokenId);
      expect(builder).toBeTypeOf('function');
    }
  });

  it('未注册的 token 返回 undefined', () => {
    expect(getChartBuilder(ChartTokenId.SLEEP_STAGE_LAST_NIGHT)).toBeUndefined();
    expect(getChartBuilder(ChartTokenId.HRV_SLEEP_14DAYS_COMPARE)).toBeUndefined();
  });
});
