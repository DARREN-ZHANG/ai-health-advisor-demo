import { describe, expect, it } from 'vitest';
import { queryKnowledgeFactsTool } from '../query-knowledge-facts';
import { createInMemoryKnowledgeRepository } from '../../knowledge/loader';

describe('queryKnowledgeFactsTool', () => {
  it('returns reviewed health facts with evidence ids', async () => {
    const result = await queryKnowledgeFactsTool.execute(
      { metrics: ['hrv'], intents: ['explain_metric'], limit: 3 },
      {
        packet: { evidence: [], visibleCharts: [], missingData: [] } as never,
        context: {} as never,
        knowledgeRepository: createInMemoryKnowledgeRepository({
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
        }),
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.facts.map((fact) => fact.id)).toEqual(['health-hrv-general-001']);
      expect(result.evidenceIds).toEqual(['knowledge_health-hrv-general-001']);
    }
  });

  it('returns empty facts when repository is absent', async () => {
    const result = await queryKnowledgeFactsTool.execute(
      { metrics: ['hrv'] },
      { packet: { evidence: [], visibleCharts: [], missingData: [] } as never, context: {} as never },
    );

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.facts).toEqual([]);
  });
});
