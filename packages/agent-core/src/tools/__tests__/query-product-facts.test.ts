import { describe, expect, it } from 'vitest';
import { queryProductFactsTool } from '../query-product-facts';
import { createInMemoryKnowledgeRepository } from '../../knowledge/loader';

describe('queryProductFactsTool', () => {
  it('returns reviewed product facts with evidence ids', async () => {
    const result = await queryProductFactsTool.execute(
      { metrics: ['sleep'], productAreas: ['chart'], limit: 3 },
      {
        packet: { evidence: [], visibleCharts: [], missingData: [] } as never,
        context: {} as never,
        knowledgeRepository: createInMemoryKnowledgeRepository({
          healthFacts: [],
          productFacts: [
            {
              id: 'product-sleep-chart-001',
              layer: 'product_knowledge',
              title: '睡眠图表说明',
              claim: 'SLEEP_7DAYS 展示最近 7 天睡眠总时长趋势。',
              productAreas: ['chart'],
              metrics: ['sleep'],
              sourceIds: ['source-product-chart-001'],
              expiresAt: '2026-12-31',
              evidenceId: 'product_product-sleep-chart-001',
            },
          ],
        }),
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.facts.map((fact) => fact.id)).toEqual(['product-sleep-chart-001']);
      expect(result.evidenceIds).toEqual(['product_product-sleep-chart-001']);
    }
  });
});
