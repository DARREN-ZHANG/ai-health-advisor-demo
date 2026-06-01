import { describe, expect, it } from 'vitest';
import { KnowledgeFactSchema, ProductFactSchema, parseCompiledKnowledge } from '../schemas';

describe('knowledge schemas', () => {
  it('accepts approved compiled health facts', () => {
    const fact = KnowledgeFactSchema.parse({
      id: 'health-hrv-general-001',
      layer: 'health_knowledge',
      title: 'HRV 基础解释',
      claim: 'HRV 可以作为恢复状态参考，但不能单独用于诊断疾病。',
      metrics: ['hrv'],
      intents: ['explain_metric'],
      riskLevel: 'general',
      allowedClaims: ['explain_relationship'],
      prohibitedClaims: ['diagnosis', 'medication_advice'],
      sourceIds: ['source-hrv-001'],
      expiresAt: '2026-12-31',
      evidenceId: 'knowledge_health-hrv-general-001',
    });

    expect(fact.id).toBe('health-hrv-general-001');
  });

  it('rejects health facts without source ids', () => {
    const result = KnowledgeFactSchema.safeParse({
      id: 'health-hrv-general-001',
      layer: 'health_knowledge',
      title: 'HRV 基础解释',
      claim: 'HRV 可以作为恢复状态参考。',
      metrics: ['hrv'],
      intents: ['explain_metric'],
      riskLevel: 'general',
      allowedClaims: ['explain_relationship'],
      prohibitedClaims: ['diagnosis'],
      sourceIds: [],
      expiresAt: '2026-12-31',
      evidenceId: 'knowledge_health-hrv-general-001',
    });

    expect(result.success).toBe(false);
  });

  it('accepts approved compiled product facts', () => {
    const fact = ProductFactSchema.parse({
      id: 'product-sleep-chart-001',
      layer: 'product_knowledge',
      title: '睡眠图表说明',
      claim: 'SLEEP_7DAYS 展示最近 7 天睡眠总时长趋势。',
      productAreas: ['chart'],
      metrics: ['sleep'],
      sourceIds: ['source-product-chart-001'],
      expiresAt: '2026-12-31',
      evidenceId: 'product_product-sleep-chart-001',
    });

    expect(fact.productAreas).toEqual(['chart']);
  });

  it('parses compiled knowledge payloads', () => {
    const parsed = parseCompiledKnowledge({
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
      productFacts: [],
    });

    expect(parsed.healthFacts).toHaveLength(1);
  });
});
