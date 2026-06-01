import { z } from 'zod';
import type { CompiledKnowledge, KnowledgeFact, ProductFact } from './types';

const NonEmptyStringArray = z.array(z.string().min(1)).min(1);

export const KnowledgeFactSchema: z.ZodType<KnowledgeFact> = z.object({
  id: z.string().min(1),
  layer: z.literal('health_knowledge'),
  title: z.string().min(1),
  claim: z.string().min(1),
  metrics: z.array(z.string().min(1)),
  intents: z.array(z.string().min(1)),
  riskLevel: z.enum(['general', 'potential_risk', 'safety_boundary']),
  allowedClaims: z.array(z.string().min(1)),
  prohibitedClaims: z.array(z.string().min(1)),
  sourceIds: NonEmptyStringArray,
  expiresAt: z.string().min(1),
  evidenceId: z.string().min(1),
});

export const ProductFactSchema: z.ZodType<ProductFact> = z.object({
  id: z.string().min(1),
  layer: z.literal('product_knowledge'),
  title: z.string().min(1),
  claim: z.string().min(1),
  productAreas: z.array(z.string().min(1)),
  metrics: z.array(z.string().min(1)),
  sourceIds: NonEmptyStringArray,
  expiresAt: z.string().min(1),
  evidenceId: z.string().min(1),
});

export const CompiledKnowledgeSchema: z.ZodType<CompiledKnowledge> = z.object({
  healthFacts: z.array(KnowledgeFactSchema),
  productFacts: z.array(ProductFactSchema),
});

export function parseCompiledKnowledge(input: unknown): CompiledKnowledge {
  return CompiledKnowledgeSchema.parse(input);
}
