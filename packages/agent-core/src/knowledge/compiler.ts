import { z } from 'zod';
import type { CompiledKnowledge, KnowledgeFact, ProductFact } from './types';
import { parseCompiledKnowledge } from './schemas';

const FrontmatterSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  layer: z.enum(['health_knowledge', 'product_knowledge']),
  metrics: z.array(z.string()).default([]),
  intents: z.array(z.string()).default([]),
  productAreas: z.array(z.string()).default([]),
  riskLevel: z.enum(['general', 'potential_risk', 'safety_boundary']).optional(),
  reviewStatus: z.string().min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
  expiresAt: z.string().min(1),
  allowedClaims: z.array(z.string()).default([]),
  prohibitedClaims: z.array(z.string()).default([]),
});

export interface CompileMarkdownInput {
  path: string;
  content: string;
  today: string;
}

export function compileKnowledgeMarkdown(input: CompileMarkdownInput): CompiledKnowledge {
  const { data, body } = parseFrontmatter(input.content, input.path);
  if (data.reviewStatus !== 'approved') return { healthFacts: [], productFacts: [] };
  if (data.expiresAt < input.today) {
    throw new Error(`Knowledge page expired: ${input.path} expiresAt=${data.expiresAt}`);
  }

  const blocks = extractFactBlocks(body, input.path);
  const compiled: CompiledKnowledge = { healthFacts: [], productFacts: [] };

  for (const block of blocks) {
    if (data.layer === 'health_knowledge') {
      if (!data.riskLevel) throw new Error(`Health knowledge page missing riskLevel: ${input.path}`);
      const fact: KnowledgeFact = {
        id: block.id,
        layer: 'health_knowledge',
        title: data.title,
        claim: block.claim,
        metrics: data.metrics,
        intents: data.intents,
        riskLevel: data.riskLevel,
        allowedClaims: data.allowedClaims,
        prohibitedClaims: data.prohibitedClaims,
        sourceIds: data.sourceIds,
        expiresAt: data.expiresAt,
        evidenceId: `knowledge_${block.id}`,
      };
      compiled.healthFacts.push(fact);
    } else {
      const fact: ProductFact = {
        id: block.id,
        layer: 'product_knowledge',
        title: data.title,
        claim: block.claim,
        productAreas: data.productAreas,
        metrics: data.metrics,
        sourceIds: data.sourceIds,
        expiresAt: data.expiresAt,
        evidenceId: `product_${block.id}`,
      };
      compiled.productFacts.push(fact);
    }
  }

  return parseCompiledKnowledge(compiled);
}

function parseFrontmatter(content: string, path: string): { data: z.infer<typeof FrontmatterSchema>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error(`Missing frontmatter: ${path}`);
  const raw = parseSimpleYaml(match[1]!);
  return { data: FrontmatterSchema.parse(raw), body: match[2]! };
}

function parseSimpleYaml(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = raw.split('\n');
  let currentKey: string | undefined;

  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const listMatch = line.match(/^\s+-\s+(.+)$/);
    if (listMatch && currentKey) {
      const existing = Array.isArray(result[currentKey]) ? result[currentKey] as string[] : [];
      result[currentKey] = [...existing, listMatch[1]!.trim()];
      continue;
    }

    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) continue;
    currentKey = pair[1]!;
    const value = pair[2]!.trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      result[currentKey] = value.slice(1, -1).split(',').map((item) => item.trim()).filter(Boolean);
    } else if (value.length === 0) {
      result[currentKey] = [];
    } else {
      result[currentKey] = value;
    }
  }

  return result;
}

function extractFactBlocks(body: string, path: string): Array<{ id: string; claim: string }> {
  const blocks: Array<{ id: string; claim: string }> = [];
  const pattern = /<!-- fact:start id=([A-Za-z0-9_-]+) -->\n([\s\S]*?)\n<!-- fact:end -->/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(body)) !== null) {
    blocks.push({ id: match[1]!, claim: match[2]!.trim().replace(/\s+/g, ' ') });
  }

  if (blocks.length === 0) throw new Error(`No fact blocks found: ${path}`);
  return blocks;
}
