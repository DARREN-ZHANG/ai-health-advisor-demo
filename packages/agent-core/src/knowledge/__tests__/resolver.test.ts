import { describe, expect, it } from 'vitest';
import { createInMemoryKnowledgeRepository } from '../loader';
import { resolveKnowledgeByPlan } from '../resolver';

describe('resolveKnowledgeByPlan', () => {
  it('resolves knowledge and product facts from plan needs', () => {
    const result = resolveKnowledgeByPlan({
      plan: {
        knowledgeNeeds: [
          { metrics: ['hrv'], intents: ['explain_metric'], riskLevel: 'general', reason: '解释 HRV' },
        ],
        productNeeds: [
          { metrics: ['sleep'], productAreas: ['chart'], reason: '解释睡眠图表' },
        ],
      } as never,
      repository: createInMemoryKnowledgeRepository({
        healthFacts: [
          {
            id: 'health-hrv-general-001',
            layer: 'health_knowledge',
            title: 'HRV 基础解释',
            claim: 'HRV 可以作为恢复状态参考，但不能单独用于诊断疾病。',
            metrics: ['hrv'],
            intents: ['explain_metric'],
            riskLevel: 'general',
            allowedClaims: ['explain_relationship'],
            prohibitedClaims: ['diagnosis'],
            sourceIds: ['source-hrv-001'],
            expiresAt: '2026-12-31',
            evidenceId: 'knowledge_health-hrv-general-001',
          },
        ],
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
    });

    expect(result.relevantFacts.map((fact) => fact.factType)).toEqual(['knowledge', 'product']);
    expect(result.evidence.map((fact) => fact.id)).toEqual([
      'knowledge_health-hrv-general-001',
      'product_product-sleep-chart-001',
    ]);
  });
});
