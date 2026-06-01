import { z } from 'zod';
import { KnowledgeFactSchema } from '../knowledge/schemas';
import type { KnowledgeFact } from '../knowledge/types';
import type { ToolDefinition, ToolExecutionContext, ToolResult } from './tool-types';

const QueryKnowledgeFactsInputSchema = z.object({
  metrics: z.array(z.string()).optional(),
  intents: z.array(z.string()).optional(),
  riskLevel: z.enum(['general', 'potential_risk', 'safety_boundary']).optional(),
  limit: z.number().int().positive().max(10).optional(),
});

const QueryKnowledgeFactsOutputSchema = z.object({
  facts: z.array(KnowledgeFactSchema),
});

type QueryKnowledgeFactsInput = z.infer<typeof QueryKnowledgeFactsInputSchema>;
type QueryKnowledgeFactsOutput = z.infer<typeof QueryKnowledgeFactsOutputSchema>;

export const queryKnowledgeFactsTool: ToolDefinition<QueryKnowledgeFactsInput, QueryKnowledgeFactsOutput> = {
  name: 'queryKnowledgeFacts',
  description: '查询已审核的通用健康知识 facts',
  inputSchema: QueryKnowledgeFactsInputSchema,
  outputSchema: QueryKnowledgeFactsOutputSchema,
  async execute(input: QueryKnowledgeFactsInput, ctx: ToolExecutionContext): Promise<ToolResult<QueryKnowledgeFactsOutput>> {
    const facts: KnowledgeFact[] = ctx.knowledgeRepository?.queryKnowledgeFacts(input) ?? [];
    return {
      success: true,
      data: { facts },
      evidenceIds: facts.map((fact) => fact.evidenceId),
    };
  },
};
