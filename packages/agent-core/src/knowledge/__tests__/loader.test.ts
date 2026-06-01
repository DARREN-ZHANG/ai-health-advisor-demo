import { describe, expect, it } from 'vitest';
import { createInMemoryKnowledgeRepository } from '../loader';

describe('knowledge loader', () => {
  const repository = createInMemoryKnowledgeRepository({
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
      {
        id: 'health-exercise-safety-001',
        layer: 'health_knowledge',
        title: '运动安全边界',
        claim: '运动建议不能替代医生诊断；明显不适时应停止运动并咨询医生。',
        metrics: ['hrv', 'sleep', 'stress'],
        intents: ['exercise_readiness'],
        riskLevel: 'safety_boundary',
        allowedClaims: ['general_lifestyle_guidance'],
        prohibitedClaims: ['diagnosis', 'treatment_promise'],
        sourceIds: ['source-hrv-001'],
        expiresAt: '2026-12-31',
        evidenceId: 'knowledge_health-exercise-safety-001',
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
  });

  it('filters health facts by metric and intent', () => {
    const facts = repository.queryKnowledgeFacts({
      metrics: ['hrv'],
      intents: ['explain_metric'],
    });

    expect(facts.map((f) => f.id)).toEqual(['health-hrv-general-001']);
  });

  it('filters health facts by risk level', () => {
    const facts = repository.queryKnowledgeFacts({
      riskLevel: 'safety_boundary',
    });

    expect(facts.map((f) => f.id)).toEqual(['health-exercise-safety-001']);
  });

  it('filters product facts by product area and metric', () => {
    const facts = repository.queryProductFacts({
      productAreas: ['chart'],
      metrics: ['sleep'],
    });

    expect(facts.map((f) => f.id)).toEqual(['product-sleep-chart-001']);
  });
});
