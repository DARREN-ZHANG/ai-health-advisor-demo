import { describe, it, expect } from 'vitest';
import { ChartTokenId } from '@health-advisor/shared';
import { getChartBuilder } from '../registry/token-registry';

const allTokens = Object.values(ChartTokenId);

describe('token-registry', () => {
  it('所有 ChartTokenId 都已注册 builder 函数', () => {
    for (const tokenId of allTokens) {
      const builder = getChartBuilder(tokenId);
      expect(builder, `${tokenId} 未注册`).toBeTypeOf('function');
    }
  });
});
