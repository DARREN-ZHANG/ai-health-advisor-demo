export type KnowledgeRiskLevel = 'general' | 'potential_risk' | 'safety_boundary';

export interface KnowledgeFact {
  id: string;
  layer: 'health_knowledge';
  title: string;
  claim: string;
  metrics: string[];
  intents: string[];
  riskLevel: KnowledgeRiskLevel;
  allowedClaims: string[];
  prohibitedClaims: string[];
  sourceIds: string[];
  expiresAt: string;
  evidenceId: string;
}

export interface ProductFact {
  id: string;
  layer: 'product_knowledge';
  title: string;
  claim: string;
  productAreas: string[];
  metrics: string[];
  sourceIds: string[];
  expiresAt: string;
  evidenceId: string;
}

export interface CompiledKnowledge {
  healthFacts: KnowledgeFact[];
  productFacts: ProductFact[];
}

export interface KnowledgeQuery {
  metrics?: string[];
  intents?: string[];
  riskLevel?: KnowledgeRiskLevel;
  limit?: number;
}

export interface ProductQuery {
  metrics?: string[];
  productAreas?: string[];
  limit?: number;
}

export interface KnowledgeRepository {
  queryKnowledgeFacts(query: KnowledgeQuery): KnowledgeFact[];
  queryProductFacts(query: ProductQuery): ProductFact[];
}
