import type { EvidenceFact, RelevantFactPacket } from '../context/context-packet';
import type { AnalysisPlan } from '../planner/analysis-plan';
import type { KnowledgeRepository } from './types';

export interface KnowledgeResolutionInput {
  plan: AnalysisPlan;
  repository: KnowledgeRepository;
}

export interface KnowledgeResolutionResult {
  relevantFacts: RelevantFactPacket[];
  evidence: EvidenceFact[];
}

export function resolveKnowledgeByPlan(input: KnowledgeResolutionInput): KnowledgeResolutionResult {
  const relevantFacts: RelevantFactPacket[] = [];
  const evidence: EvidenceFact[] = [];
  const seenEvidence = new Set<string>();

  for (const need of input.plan.knowledgeNeeds ?? []) {
    const facts = input.repository.queryKnowledgeFacts({ ...need, limit: 5 });
    for (const fact of facts) {
      relevantFacts.push({
        label: `知识: ${fact.title}`,
        factType: 'knowledge',
        summary: fact.claim,
        evidenceIds: [fact.evidenceId],
      });
      if (!seenEvidence.has(fact.evidenceId)) {
        seenEvidence.add(fact.evidenceId);
        evidence.push({
          id: fact.evidenceId,
          source: 'knowledge_base',
          metric: fact.metrics[0],
          derivation: `compiled reviewed health knowledge fact ${fact.id}`,
        });
      }
    }
  }

  for (const need of input.plan.productNeeds ?? []) {
    const facts = input.repository.queryProductFacts({ ...need, limit: 5 });
    for (const fact of facts) {
      relevantFacts.push({
        label: `产品: ${fact.title}`,
        factType: 'product',
        summary: fact.claim,
        evidenceIds: [fact.evidenceId],
      });
      if (!seenEvidence.has(fact.evidenceId)) {
        seenEvidence.add(fact.evidenceId);
        evidence.push({
          id: fact.evidenceId,
          source: 'knowledge_base',
          metric: fact.metrics[0],
          derivation: `compiled reviewed product knowledge fact ${fact.id}`,
        });
      }
    }
  }

  return { relevantFacts, evidence };
}
