import type {
  CompiledKnowledge,
  KnowledgeFact,
  KnowledgeQuery,
  KnowledgeRepository,
  ProductFact,
  ProductQuery,
} from './types';
import { parseCompiledKnowledge } from './schemas';

export function createInMemoryKnowledgeRepository(input: unknown): KnowledgeRepository {
  const compiled = parseCompiledKnowledge(input);

  return {
    queryKnowledgeFacts(query) {
      return applyLimit(
        compiled.healthFacts.filter((fact) => matchesKnowledgeFact(fact, query)),
        query.limit,
      );
    },
    queryProductFacts(query) {
      return applyLimit(
        compiled.productFacts.filter((fact) => matchesProductFact(fact, query)),
        query.limit,
      );
    },
  };
}

export function createEmptyKnowledgeRepository(): KnowledgeRepository {
  return createInMemoryKnowledgeRepository({ healthFacts: [], productFacts: [] } satisfies CompiledKnowledge);
}

function matchesKnowledgeFact(fact: KnowledgeFact, query: KnowledgeQuery): boolean {
  if (query.riskLevel && fact.riskLevel !== query.riskLevel) return false;
  if (query.metrics && query.metrics.length > 0 && !hasAny(fact.metrics, query.metrics)) return false;
  if (query.intents && query.intents.length > 0 && !hasAny(fact.intents, query.intents)) return false;
  return true;
}

function matchesProductFact(fact: ProductFact, query: ProductQuery): boolean {
  if (query.metrics && query.metrics.length > 0 && !hasAny(fact.metrics, query.metrics)) return false;
  if (query.productAreas && query.productAreas.length > 0 && !hasAny(fact.productAreas, query.productAreas)) return false;
  return true;
}

function hasAny(values: string[], expected: string[]): boolean {
  const set = new Set(values);
  return expected.some((value) => set.has(value));
}

function applyLimit<T>(items: T[], limit: number | undefined): T[] {
  if (limit === undefined) return items;
  return items.slice(0, Math.max(0, limit));
}
