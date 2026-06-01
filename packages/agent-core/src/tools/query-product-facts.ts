import { z } from 'zod';
import { ProductFactSchema } from '../knowledge/schemas';
import type { ProductFact } from '../knowledge/types';
import type { ToolDefinition, ToolExecutionContext, ToolResult } from './tool-types';

const QueryProductFactsInputSchema = z.object({
  metrics: z.array(z.string()).optional(),
  productAreas: z.array(z.string()).optional(),
  limit: z.number().int().positive().max(10).optional(),
});

const QueryProductFactsOutputSchema = z.object({
  facts: z.array(ProductFactSchema),
});

type QueryProductFactsInput = z.infer<typeof QueryProductFactsInputSchema>;
type QueryProductFactsOutput = z.infer<typeof QueryProductFactsOutputSchema>;

export const queryProductFactsTool: ToolDefinition<QueryProductFactsInput, QueryProductFactsOutput> = {
  name: 'queryProductFacts',
  description: '查询已审核的设备和产品知识 facts',
  inputSchema: QueryProductFactsInputSchema,
  outputSchema: QueryProductFactsOutputSchema,
  async execute(input: QueryProductFactsInput, ctx: ToolExecutionContext): Promise<ToolResult<QueryProductFactsOutput>> {
    const facts: ProductFact[] = ctx.knowledgeRepository?.queryProductFacts(input) ?? [];
    return {
      success: true,
      data: { facts },
      evidenceIds: facts.map((fact) => fact.evidenceId),
    };
  },
};
