# Advisor Chat Knowledge Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first-phase Advisor Chat Knowledge Layer for reviewed health knowledge and product/device knowledge, without adding user long-term memory.

**Architecture:** Markdown wiki pages with frontmatter and explicit fact blocks are compiled into structured `KnowledgeFact` and `ProductFact` JSON files. Agent runtime loads compiled facts, exposes them through deterministic tools, injects matched facts into `TaskContextPacket`, and verifies that Advisor Chat claims cite knowledge/product evidence.

**Tech Stack:** TypeScript, Zod, Vitest, pnpm, existing `@health-advisor/agent-core` runtime, existing ReAct tool conventions, existing eval runner.

---

## Scope Check

This plan implements only the first-phase Knowledge Layer described in `docs/superpowers/specs/2026-05-10-advisor-chat-knowledge-layer-design.md`.

Included:

- Reviewed general health knowledge.
- Reviewed product/device knowledge.
- Markdown frontmatter and explicit fact blocks.
- Compiled JSON runtime facts.
- Deterministic query tools.
- Advisor Chat context/render/verifier/eval integration.

Excluded:

- User long-term memory.
- Cross-session memory retrieval.
- User preference writes.
- Database, Redis, external vector store, or GraphRAG.
- LLM auto-extraction of facts from raw documents.

## File Structure

Create:

- `knowledge/sources/health/source-hrv-001.md` - source metadata for HRV general knowledge.
- `knowledge/sources/product/source-product-chart-001.md` - source metadata for product chart knowledge.
- `knowledge/wiki/health/hrv-basics.md` - reviewed health wiki sample with frontmatter and fact block.
- `knowledge/wiki/health/exercise-readiness.md` - reviewed safety-boundary wiki sample.
- `knowledge/wiki/product/chart-token-guide.md` - reviewed product chart wiki sample.
- `knowledge/wiki/product/device-data-quality.md` - reviewed product data-quality wiki sample.
- `knowledge/compiled/knowledge-facts.json` - generated reviewed health facts.
- `knowledge/compiled/product-facts.json` - generated reviewed product facts.
- `knowledge/compiled/manifest.json` - generated compile manifest.
- `packages/agent-core/src/knowledge/types.ts` - runtime knowledge type definitions.
- `packages/agent-core/src/knowledge/schemas.ts` - Zod schemas and parse helpers.
- `packages/agent-core/src/knowledge/compiler.ts` - Markdown/frontmatter compiler.
- `packages/agent-core/src/knowledge/loader.ts` - compiled fact loader and in-memory repository.
- `packages/agent-core/src/knowledge/resolver.ts` - deterministic plan-to-fact resolver.
- `packages/agent-core/src/knowledge/__tests__/schemas.test.ts` - schema tests.
- `packages/agent-core/src/knowledge/__tests__/compiler.test.ts` - compiler tests.
- `packages/agent-core/src/knowledge/__tests__/loader.test.ts` - loader tests.
- `packages/agent-core/src/knowledge/__tests__/resolver.test.ts` - resolver tests.
- `packages/agent-core/src/tools/query-knowledge-facts.ts` - health knowledge query tool.
- `packages/agent-core/src/tools/query-product-facts.ts` - product knowledge query tool.
- `packages/agent-core/src/tools/__tests__/query-knowledge-facts.test.ts` - health knowledge tool tests.
- `packages/agent-core/src/tools/__tests__/query-product-facts.test.ts` - product knowledge tool tests.
- `packages/agent-core/evals/cases/smoke/chat-hrv-knowledge.json` - smoke eval for health knowledge citation.
- `packages/agent-core/evals/cases/smoke/chat-product-chart-knowledge.json` - smoke eval for product knowledge citation.

Modify:

- `packages/agent-core/src/context/context-packet.ts` - add `knowledge` and `product` relevant fact types and `knowledge_base` evidence source.
- `packages/agent-core/src/prompts/context-packet-renderer.ts` - render reviewed knowledge/product facts as isolated sections.
- `packages/agent-core/src/planner/analysis-plan.ts` - add `knowledgeNeeds` and `productNeeds` to `AnalysisPlan`.
- `packages/agent-core/src/planner/advisor-plan-builder.ts` - include knowledge need instructions in planner user prompt.
- `data/sandbox/prompts/advisor-plan.md` - require planner to emit knowledge/product needs when useful.
- `packages/agent-core/src/runtime/agent-runtime.ts` - load/resolve knowledge facts after plan succeeds and before prompt render.
- `packages/agent-core/src/output/verifier.ts` - add deterministic knowledge/product claim checks.
- `packages/agent-core/src/tools/index.ts` - export new tools.
- `packages/agent-core/src/index.ts` - export knowledge types, loader, resolver, and tools.

## Task 1: Knowledge Types, Schemas, Loader

**Files:**

- Create: `packages/agent-core/src/knowledge/types.ts`
- Create: `packages/agent-core/src/knowledge/schemas.ts`
- Create: `packages/agent-core/src/knowledge/loader.ts`
- Create: `packages/agent-core/src/knowledge/__tests__/schemas.test.ts`
- Create: `packages/agent-core/src/knowledge/__tests__/loader.test.ts`
- Modify: `packages/agent-core/src/index.ts`

- [ ] **Step 1: Write failing schema tests**

Add `packages/agent-core/src/knowledge/__tests__/schemas.test.ts`:

```ts
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
```

- [ ] **Step 2: Run schema tests to verify failure**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/knowledge/__tests__/schemas.test.ts
```

Expected: FAIL because `../schemas` does not exist.

- [ ] **Step 3: Add knowledge types**

Create `packages/agent-core/src/knowledge/types.ts`:

```ts
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
```

- [ ] **Step 4: Add schemas**

Create `packages/agent-core/src/knowledge/schemas.ts`:

```ts
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
```

- [ ] **Step 5: Write failing loader tests**

Add `packages/agent-core/src/knowledge/__tests__/loader.test.ts`:

```ts
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
```

- [ ] **Step 6: Run loader tests to verify failure**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/knowledge/__tests__/loader.test.ts
```

Expected: FAIL because `../loader` does not exist.

- [ ] **Step 7: Add loader**

Create `packages/agent-core/src/knowledge/loader.ts`:

```ts
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
```

- [ ] **Step 8: Export knowledge APIs**

Modify `packages/agent-core/src/index.ts`:

```ts
export type {
  KnowledgeFact,
  ProductFact,
  CompiledKnowledge,
  KnowledgeQuery,
  ProductQuery,
  KnowledgeRepository,
  KnowledgeRiskLevel,
} from './knowledge/types';
export {
  KnowledgeFactSchema,
  ProductFactSchema,
  CompiledKnowledgeSchema,
  parseCompiledKnowledge,
} from './knowledge/schemas';
export {
  createInMemoryKnowledgeRepository,
  createEmptyKnowledgeRepository,
} from './knowledge/loader';
```

- [ ] **Step 9: Run tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/knowledge/__tests__/schemas.test.ts src/knowledge/__tests__/loader.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/agent-core/src/knowledge packages/agent-core/src/index.ts
git commit -m "feat(agent-core): add knowledge fact schemas"
```

## Task 2: Wiki Samples and Compiler

**Files:**

- Create: `knowledge/sources/health/source-hrv-001.md`
- Create: `knowledge/sources/product/source-product-chart-001.md`
- Create: `knowledge/wiki/health/hrv-basics.md`
- Create: `knowledge/wiki/health/exercise-readiness.md`
- Create: `knowledge/wiki/product/chart-token-guide.md`
- Create: `knowledge/wiki/product/device-data-quality.md`
- Create: `knowledge/compiled/knowledge-facts.json`
- Create: `knowledge/compiled/product-facts.json`
- Create: `knowledge/compiled/manifest.json`
- Create: `packages/agent-core/src/knowledge/compiler.ts`
- Create: `packages/agent-core/src/knowledge/__tests__/compiler.test.ts`
- Modify: `packages/agent-core/src/index.ts`

- [ ] **Step 1: Write failing compiler tests**

Create `packages/agent-core/src/knowledge/__tests__/compiler.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { compileKnowledgeMarkdown } from '../compiler';

describe('knowledge compiler', () => {
  it('compiles approved health facts from frontmatter and fact blocks', () => {
    const result = compileKnowledgeMarkdown({
      path: 'knowledge/wiki/health/hrv-basics.md',
      content: `---
id: health-hrv-basics
title: HRV 基础解释
layer: health_knowledge
metrics: [hrv]
intents: [explain_metric]
riskLevel: general
reviewStatus: approved
sourceIds: [source-hrv-001]
expiresAt: 2026-12-31
allowedClaims: [explain_relationship]
prohibitedClaims: [diagnosis]
---

# HRV 基础解释

<!-- fact:start id=health-hrv-general-001 -->
HRV 可以作为恢复状态参考，但不能单独用于诊断疾病。
<!-- fact:end -->
`,
      today: '2026-05-10',
    });

    expect(result.healthFacts).toEqual([
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
    ]);
    expect(result.productFacts).toEqual([]);
  });

  it('rejects expired approved pages', () => {
    expect(() => compileKnowledgeMarkdown({
      path: 'knowledge/wiki/health/hrv-basics.md',
      content: `---
id: health-hrv-basics
title: HRV 基础解释
layer: health_knowledge
metrics: [hrv]
intents: [explain_metric]
riskLevel: general
reviewStatus: approved
sourceIds: [source-hrv-001]
expiresAt: 2026-01-01
allowedClaims: [explain_relationship]
prohibitedClaims: [diagnosis]
---

<!-- fact:start id=health-hrv-general-001 -->
HRV 可以作为恢复状态参考。
<!-- fact:end -->
`,
      today: '2026-05-10',
    })).toThrow(/expired/);
  });

  it('skips non-approved pages', () => {
    const result = compileKnowledgeMarkdown({
      path: 'knowledge/wiki/product/chart-token-guide.md',
      content: `---
id: product-chart-token-guide
title: 图表 token 说明
layer: product_knowledge
productAreas: [chart]
metrics: [sleep]
reviewStatus: draft
sourceIds: [source-product-chart-001]
expiresAt: 2026-12-31
---

<!-- fact:start id=product-sleep-chart-001 -->
SLEEP_7DAYS 展示最近 7 天睡眠总时长趋势。
<!-- fact:end -->
`,
      today: '2026-05-10',
    });

    expect(result.healthFacts).toEqual([]);
    expect(result.productFacts).toEqual([]);
  });
});
```

- [ ] **Step 2: Run compiler test to verify failure**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/knowledge/__tests__/compiler.test.ts
```

Expected: FAIL because `../compiler` does not exist.

- [ ] **Step 3: Add compiler**

Create `packages/agent-core/src/knowledge/compiler.ts`:

```ts
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
```

- [ ] **Step 4: Add sample wiki and compiled JSON**

Create these source/wiki files with the exact content below.

`knowledge/sources/health/source-hrv-001.md`:

```md
# source-hrv-001

Internal reviewed source placeholder for demo HRV and exercise-readiness guidance.
```

`knowledge/sources/product/source-product-chart-001.md`:

```md
# source-product-chart-001

Internal reviewed source placeholder for demo chart token and device data-quality guidance.
```

`knowledge/wiki/health/hrv-basics.md`:

```md
---
id: health-hrv-basics
title: HRV 基础解释
layer: health_knowledge
metrics: [hrv]
intents: [explain_metric, ask_why]
riskLevel: general
reviewStatus: approved
sourceIds: [source-hrv-001]
expiresAt: 2026-12-31
allowedClaims: [explain_relationship, general_lifestyle_guidance]
prohibitedClaims: [diagnosis, medication_advice, treatment_promise]
---

# HRV 基础解释

<!-- fact:start id=health-hrv-general-001 -->
HRV 可以作为恢复状态和自主神经系统压力的参考指标，但不能单独用于诊断疾病。
<!-- fact:end -->
```

`knowledge/wiki/health/exercise-readiness.md`:

```md
---
id: health-exercise-readiness
title: 运动准备度安全边界
layer: health_knowledge
metrics: [hrv, sleep, stress, activity]
intents: [exercise_readiness]
riskLevel: safety_boundary
reviewStatus: approved
sourceIds: [source-hrv-001]
expiresAt: 2026-12-31
allowedClaims: [general_lifestyle_guidance]
prohibitedClaims: [diagnosis, medication_advice, treatment_promise]
---

# 运动准备度安全边界

<!-- fact:start id=health-exercise-safety-001 -->
运动建议不能替代医生诊断；如果用户出现明显不适、胸痛、晕厥或持续异常，应停止运动并咨询医生。
<!-- fact:end -->
```

`knowledge/wiki/product/chart-token-guide.md`:

```md
---
id: product-chart-token-guide
title: 图表 token 说明
layer: product_knowledge
productAreas: [chart]
metrics: [sleep, hrv]
reviewStatus: approved
sourceIds: [source-product-chart-001]
expiresAt: 2026-12-31
---

# 图表 token 说明

<!-- fact:start id=product-sleep-chart-001 -->
SLEEP_7DAYS 展示最近 7 天睡眠总时长趋势。
<!-- fact:end -->
```

`knowledge/wiki/product/device-data-quality.md`:

```md
---
id: product-device-data-quality
title: 设备数据质量说明
layer: product_knowledge
productAreas: [data_quality]
metrics: [spo2, hrv, sleep]
reviewStatus: approved
sourceIds: [source-product-chart-001]
expiresAt: 2026-12-31
---

# 设备数据质量说明

<!-- fact:start id=product-spo2-missing-001 -->
血氧数据缺失通常表示当前窗口没有可用采样，Advisor Chat 不能据此推断具体血氧数值。
<!-- fact:end -->
```

Create compiled JSON files matching those facts. Keep JSON deterministic with two-space indentation.

- [ ] **Step 5: Export compiler**

Modify `packages/agent-core/src/index.ts`:

```ts
export { compileKnowledgeMarkdown } from './knowledge/compiler';
export type { CompileMarkdownInput } from './knowledge/compiler';
```

- [ ] **Step 6: Run compiler tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/knowledge/__tests__/compiler.test.ts
```

Expected: PASS.

- [ ] **Step 7: Validate compiled JSON through schemas**

Run:

```bash
pnpm --filter @health-advisor/agent-core exec tsx -e "import fs from 'node:fs'; import { parseCompiledKnowledge } from './src/knowledge/schemas'; parseCompiledKnowledge({ healthFacts: JSON.parse(fs.readFileSync('../../knowledge/compiled/knowledge-facts.json','utf8')), productFacts: JSON.parse(fs.readFileSync('../../knowledge/compiled/product-facts.json','utf8')) }); console.log('knowledge compiled facts valid')"
```

Expected: prints `knowledge compiled facts valid`.

- [ ] **Step 8: Commit**

```bash
git add knowledge packages/agent-core/src/knowledge/compiler.ts packages/agent-core/src/knowledge/__tests__/compiler.test.ts packages/agent-core/src/index.ts
git commit -m "feat(agent-core): compile reviewed knowledge facts"
```

## Task 3: Knowledge Query Tools

**Files:**

- Create: `packages/agent-core/src/tools/query-knowledge-facts.ts`
- Create: `packages/agent-core/src/tools/query-product-facts.ts`
- Create: `packages/agent-core/src/tools/__tests__/query-knowledge-facts.test.ts`
- Create: `packages/agent-core/src/tools/__tests__/query-product-facts.test.ts`
- Modify: `packages/agent-core/src/tools/tool-types.ts`
- Modify: `packages/agent-core/src/tools/index.ts`
- Modify: `packages/agent-core/src/index.ts`

- [ ] **Step 1: Extend tool execution context**

Modify `packages/agent-core/src/tools/tool-types.ts`:

```ts
import type { KnowledgeRepository } from '../knowledge/types';

export interface ToolExecutionContext {
  packet: TaskContextPacket;
  context: AgentContext;
  knowledgeRepository?: KnowledgeRepository;
}
```

- [ ] **Step 2: Write failing knowledge tool test**

Create `packages/agent-core/src/tools/__tests__/query-knowledge-facts.test.ts`:

```ts
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
```

- [ ] **Step 3: Run knowledge tool test to verify failure**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/tools/__tests__/query-knowledge-facts.test.ts
```

Expected: FAIL because `query-knowledge-facts` does not exist.

- [ ] **Step 4: Implement knowledge tool**

Create `packages/agent-core/src/tools/query-knowledge-facts.ts`:

```ts
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
```

- [ ] **Step 5: Write failing product tool test**

Create `packages/agent-core/src/tools/__tests__/query-product-facts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { queryProductFactsTool } from '../query-product-facts';
import { createInMemoryKnowledgeRepository } from '../../knowledge/loader';

describe('queryProductFactsTool', () => {
  it('returns reviewed product facts with evidence ids', async () => {
    const result = await queryProductFactsTool.execute(
      { metrics: ['sleep'], productAreas: ['chart'], limit: 3 },
      {
        packet: { evidence: [], visibleCharts: [], missingData: [] } as never,
        context: {} as never,
        knowledgeRepository: createInMemoryKnowledgeRepository({
          healthFacts: [],
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
        }),
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.facts.map((fact) => fact.id)).toEqual(['product-sleep-chart-001']);
      expect(result.evidenceIds).toEqual(['product_product-sleep-chart-001']);
    }
  });
});
```

- [ ] **Step 6: Implement product tool**

Create `packages/agent-core/src/tools/query-product-facts.ts`:

```ts
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
```

- [ ] **Step 7: Export tools**

Modify `packages/agent-core/src/tools/index.ts`:

```ts
export { queryKnowledgeFactsTool } from './query-knowledge-facts';
export { queryProductFactsTool } from './query-product-facts';
```

Modify `packages/agent-core/src/index.ts`:

```ts
export { queryKnowledgeFactsTool } from './tools/query-knowledge-facts';
export { queryProductFactsTool } from './tools/query-product-facts';
```

- [ ] **Step 8: Run tool tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/tools/__tests__/query-knowledge-facts.test.ts src/tools/__tests__/query-product-facts.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/agent-core/src/tools packages/agent-core/src/index.ts
git commit -m "feat(agent-core): add knowledge query tools"
```

## Task 4: Context Packet, Renderer, Verifier

**Files:**

- Modify: `packages/agent-core/src/context/context-packet.ts`
- Modify: `packages/agent-core/src/prompts/context-packet-renderer.ts`
- Modify: `packages/agent-core/src/output/verifier.ts`
- Modify: `packages/agent-core/src/index.ts`
- Modify: `packages/agent-core/src/__tests__/context/context-packet-builder.test.ts`
- Create: `packages/agent-core/src/prompts/__tests__/context-packet-renderer-knowledge.test.ts`
- Create: `packages/agent-core/src/output/__tests__/verifier-knowledge.test.ts`

- [ ] **Step 1: Extend context packet types**

Modify `packages/agent-core/src/context/context-packet.ts`:

```ts
export type EvidenceSource = 'daily_records' | 'timeline_sync' | 'profile' | 'rules' | 'memory' | 'knowledge_base';

export interface RelevantFactPacket {
  label: string;
  factType: 'metric' | 'trend' | 'missing-data' | 'chart' | 'event' | 'memory' | 'knowledge' | 'product';
  summary: string;
  evidenceIds: string[];
}
```

- [ ] **Step 2: Write failing renderer test**

Create `packages/agent-core/src/prompts/__tests__/context-packet-renderer-knowledge.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderTaskContextPacket } from '../context-packet-renderer';

describe('context packet renderer knowledge facts', () => {
  it('renders knowledge and product relevant facts in Advisor Chat packet', () => {
    const rendered = renderTaskContextPacket({
      task: { type: 'advisor_chat', page: 'advisor', userMessage: 'HRV 下降是什么意思？' },
      userContext: {
        profileId: 'profile-a',
        name: '测试用户',
        age: 32,
        tags: [],
        baselines: { restingHR: 60, hrv: 55, spo2: 98, avgSleepMinutes: 420, avgSteps: 8000 },
      },
      dataWindow: { start: '2026-05-01', end: '2026-05-10', recordCount: 10, completenessPct: 100 },
      missingData: [],
      evidence: [
        {
          id: 'knowledge_health-hrv-general-001',
          source: 'knowledge_base',
          metric: 'hrv',
          derivation: 'compiled reviewed health knowledge fact health-hrv-general-001',
        },
        {
          id: 'product_product-sleep-chart-001',
          source: 'knowledge_base',
          metric: 'sleep',
          derivation: 'compiled reviewed product knowledge fact product-sleep-chart-001',
        },
      ],
      visibleCharts: [],
      advisorChat: {
        userMessage: 'HRV 下降是什么意思？',
        questionIntent: {
          metricFocus: ['hrv'],
          timeScope: 'week',
          actionIntent: 'ask_why',
          riskLevel: 'general',
        },
        currentPage: {
          page: 'advisor',
          timeframe: 'week',
          visibleChartTokens: [],
          chartDataSummaries: [],
        },
        relevantFacts: [
          {
            label: '知识: HRV 基础解释',
            factType: 'knowledge',
            summary: 'HRV 可以作为恢复状态参考，但不能单独用于诊断疾病。',
            evidenceIds: ['knowledge_health-hrv-general-001'],
          },
          {
            label: '产品: 睡眠图表说明',
            factType: 'product',
            summary: 'SLEEP_7DAYS 展示最近 7 天睡眠总时长趋势。',
            evidenceIds: ['product_product-sleep-chart-001'],
          },
        ],
        recentConversation: [],
        constraints: [],
      },
    }, 'zh');

    expect(rendered).toContain('## Reviewed Knowledge Facts');
    expect(rendered).toContain('[knowledge_health-hrv-general-001]');
    expect(rendered).toContain('## Product Facts');
    expect(rendered).toContain('[product_product-sleep-chart-001]');
  });
});
```

- [ ] **Step 3: Run renderer test to verify failure**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/prompts/__tests__/context-packet-renderer-knowledge.test.ts
```

Expected: FAIL because renderer does not yet render isolated knowledge/product sections.

- [ ] **Step 4: Update renderer**

Modify `packages/agent-core/src/prompts/context-packet-renderer.ts` inside `renderAdvisorChat`:

```ts
const knowledgeFacts = advisor.relevantFacts.filter((fact) => fact.factType === 'knowledge');
if (knowledgeFacts.length > 0) {
  lines.push(t(locale, '## Reviewed Knowledge Facts', '## Reviewed Knowledge Facts'));
  for (const fact of knowledgeFacts) {
    lines.push(`- [${fact.evidenceIds.join(', ')}] ${fact.summary}`);
  }
}

const productFacts = advisor.relevantFacts.filter((fact) => fact.factType === 'product');
if (productFacts.length > 0) {
  lines.push(t(locale, '## Product Facts', '## Product Facts'));
  for (const fact of productFacts) {
    lines.push(`- [${fact.evidenceIds.join(', ')}] ${fact.summary}`);
  }
}
```

Keep existing non-knowledge relevant fact rendering intact.

- [ ] **Step 5: Write failing verifier test**

Create `packages/agent-core/src/output/__tests__/verifier-knowledge.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { verifyOutput } from '../verifier';

describe('knowledge verifier', () => {
  it('passes when knowledge claim has knowledge evidence', () => {
    const report = verifyOutput({
      envelope: {
        source: 'llm',
        statusColor: 'good',
        summary: 'HRV 可以作为恢复状态参考，但不能单独用于诊断疾病。',
        chartTokens: [],
        microTips: [],
        meta: { taskType: 'advisor_chat', finishReason: 'complete' },
      } as never,
      context: {
        task: { type: 'advisor_chat' },
        dataWindow: { missingFields: [] },
      } as never,
      rulesResult: { insights: [], suggestedChartTokens: [], suggestedMicroTips: [], statusColor: 'green' },
      packet: {
        evidence: [
          {
            id: 'knowledge_health-hrv-general-001',
            source: 'knowledge_base',
            metric: 'hrv',
            derivation: 'compiled reviewed health knowledge fact health-hrv-general-001',
          },
        ],
        missingData: [],
        visibleCharts: [],
        advisorChat: {
          relevantFacts: [
            {
              label: '知识: HRV 基础解释',
              factType: 'knowledge',
              summary: 'HRV 可以作为恢复状态参考，但不能单独用于诊断疾病。',
              evidenceIds: ['knowledge_health-hrv-general-001'],
            },
          ],
        },
      } as never,
      parseResult: { success: true },
    });

    expect(report.violations.find((v) => v.ruleId === 'knowledge:claim_without_evidence')?.passed).not.toBe(false);
  });

  it('fails when output contains reviewed knowledge claim without knowledge evidence', () => {
    const report = verifyOutput({
      envelope: {
        source: 'llm',
        statusColor: 'good',
        summary: 'HRV 可以作为恢复状态参考，但不能单独用于诊断疾病。',
        chartTokens: [],
        microTips: [],
        meta: { taskType: 'advisor_chat', finishReason: 'complete' },
      } as never,
      context: {
        task: { type: 'advisor_chat' },
        dataWindow: { missingFields: [] },
      } as never,
      rulesResult: { insights: [], suggestedChartTokens: [], suggestedMicroTips: [], statusColor: 'green' },
      packet: {
        evidence: [],
        missingData: [],
        visibleCharts: [],
        advisorChat: {
          relevantFacts: [
            {
              label: '知识: HRV 基础解释',
              factType: 'knowledge',
              summary: 'HRV 可以作为恢复状态参考，但不能单独用于诊断疾病。',
              evidenceIds: ['knowledge_health-hrv-general-001'],
            },
          ],
        },
      } as never,
      parseResult: { success: true },
    });

    const violation = report.violations.find((v) => v.ruleId === 'knowledge:claim_without_evidence');
    expect(violation?.passed).toBe(false);
    expect(violation?.severity).toBe('hard');
  });
});
```

- [ ] **Step 6: Update verifier**

Modify `packages/agent-core/src/output/verifier.ts`:

```ts
violations.push(...checkKnowledgeEvidence(input));
```

Add helper:

```ts
function checkKnowledgeEvidence(input: VerifierInput): QualityViolation[] {
  const relevantFacts = input.packet.advisorChat?.relevantFacts ?? [];
  const knowledgeFacts = relevantFacts.filter((fact) => fact.factType === 'knowledge' || fact.factType === 'product');
  if (knowledgeFacts.length === 0) return [];

  const evidenceIds = new Set(input.packet.evidence.map((fact) => fact.id));
  const text = buildMatchText(input.envelope);
  const violations: QualityViolation[] = [];

  for (const fact of knowledgeFacts) {
    if (!text.includes(fact.summary)) continue;
    const hasEvidence = fact.evidenceIds.some((id) => evidenceIds.has(id));
    violations.push({
      ruleId: 'knowledge:claim_without_evidence',
      severity: 'hard',
      passed: hasEvidence,
      message: hasEvidence
        ? `知识声明 "${fact.label}" 已关联 evidence`
        : `知识声明 "${fact.label}" 缺少 knowledge/product evidence`,
      details: { label: fact.label, evidenceIds: fact.evidenceIds },
    });
  }

  return violations;
}
```

- [ ] **Step 7: Run tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/prompts/__tests__/context-packet-renderer-knowledge.test.ts src/output/__tests__/verifier-knowledge.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/agent-core/src/context/context-packet.ts packages/agent-core/src/prompts/context-packet-renderer.ts packages/agent-core/src/prompts/__tests__/context-packet-renderer-knowledge.test.ts packages/agent-core/src/output/verifier.ts packages/agent-core/src/output/__tests__/verifier-knowledge.test.ts packages/agent-core/src/index.ts
git commit -m "feat(agent-core): render and verify knowledge evidence"
```

## Task 5: Planner, Runtime, Eval Integration

**Files:**

- Modify: `packages/agent-core/src/planner/analysis-plan.ts`
- Modify: `packages/agent-core/src/planner/advisor-plan-builder.ts`
- Modify: `data/sandbox/prompts/advisor-plan.md`
- Create: `packages/agent-core/src/knowledge/resolver.ts`
- Create: `packages/agent-core/src/knowledge/__tests__/resolver.test.ts`
- Modify: `packages/agent-core/src/runtime/agent-runtime.ts`
- Modify: `packages/agent-core/src/runtime/__tests__/advisor-chat-runtime.test.ts`
- Create: `packages/agent-core/evals/cases/smoke/chat-hrv-knowledge.json`
- Create: `packages/agent-core/evals/cases/smoke/chat-product-chart-knowledge.json`

- [ ] **Step 1: Write failing resolver test**

Create `packages/agent-core/src/knowledge/__tests__/resolver.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createInMemoryKnowledgeRepository } from '../loader';
import { resolveKnowledgeByPlan } from '../resolver';

describe('resolveKnowledgeByPlan', () => {
  it('resolves knowledge and product facts from plan needs', () => {
    const result = resolveKnowledgeByPlan({
      plan: {
        knowledgeNeeds: [
          { metrics: ['hrv'], intents: ['explain_metric'], riskLevel: 'general', reason: '解释 HRV' },
        ],
        productNeeds: [
          { metrics: ['sleep'], productAreas: ['chart'], reason: '解释睡眠图表' },
        ],
      } as never,
      repository: createInMemoryKnowledgeRepository({
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
      }),
    });

    expect(result.relevantFacts.map((fact) => fact.factType)).toEqual(['knowledge', 'product']);
    expect(result.evidence.map((fact) => fact.id)).toEqual([
      'knowledge_health-hrv-general-001',
      'product_product-sleep-chart-001',
    ]);
  });
});
```

- [ ] **Step 2: Extend analysis plan schema**

Modify `packages/agent-core/src/planner/analysis-plan.ts`:

```ts
const KnowledgeNeedSchema = z.object({
  metrics: z.array(z.string()).optional(),
  intents: z.array(z.string()).optional(),
  riskLevel: z.enum(['general', 'potential_risk', 'safety_boundary']).optional(),
  reason: z.string().min(1),
});

const ProductNeedSchema = z.object({
  metrics: z.array(z.string()).optional(),
  productAreas: z.array(z.string()).optional(),
  reason: z.string().min(1),
});
```

Add to `AnalysisPlanSchema`:

```ts
knowledgeNeeds: z.array(KnowledgeNeedSchema).default([]),
productNeeds: z.array(ProductNeedSchema).default([]),
```

Export inferred types:

```ts
export type KnowledgeNeed = z.infer<typeof KnowledgeNeedSchema>;
export type ProductNeed = z.infer<typeof ProductNeedSchema>;
```

- [ ] **Step 3: Add resolver**

Create `packages/agent-core/src/knowledge/resolver.ts`:

```ts
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
```

- [ ] **Step 4: Run resolver tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/knowledge/__tests__/resolver.test.ts
```

Expected: PASS.

- [ ] **Step 5: Update planner prompt builder**

Modify `packages/agent-core/src/planner/advisor-plan-builder.ts` in `buildPlannerUserPrompt()`:

```ts
sections.push(`## 外部知识规划要求
- 用户询问指标含义、为什么、运动准备度或健康解释时，生成 knowledgeNeeds。
- 用户询问图表含义、设备采集、数据缺失原因或产品能力边界时，生成 productNeeds。
- 不要把用户健康数据需求放入 knowledgeNeeds。
- 不要把通用健康解释放入 productNeeds。`);
```

Modify `data/sandbox/prompts/advisor-plan.md` output JSON example to include:

```json
"knowledgeNeeds": [
  {
    "metrics": ["hrv"],
    "intents": ["explain_metric"],
    "riskLevel": "general",
    "reason": "解释 HRV 指标含义"
  }
],
"productNeeds": [
  {
    "metrics": ["sleep"],
    "productAreas": ["chart"],
    "reason": "解释当前图表含义"
  }
],
```

- [ ] **Step 6: Extend runtime deps and packet enrichment**

Modify `packages/agent-core/src/runtime/agent-runtime.ts`:

```ts
import type { KnowledgeRepository } from '../knowledge/types';
import { resolveKnowledgeByPlan } from '../knowledge/resolver';
```

Add to `AgentRuntimeDeps`:

```ts
knowledgeRepository?: KnowledgeRepository;
```

Change packet from const to let:

```ts
let packet = buildTaskContextPacket(context, rulesResult);
```

After successful `analysisPlan` and before evidence resolver:

```ts
if (analysisPlan && deps.knowledgeRepository && packet.advisorChat) {
  const knowledgeResult = resolveKnowledgeByPlan({
    plan: analysisPlan,
    repository: deps.knowledgeRepository,
  });
  packet = {
    ...packet,
    evidence: [...packet.evidence, ...knowledgeResult.evidence],
    advisorChat: {
      ...packet.advisorChat,
      relevantFacts: [...packet.advisorChat.relevantFacts, ...knowledgeResult.relevantFacts],
    },
  };
  tryNotify(() => observer?.onPacketBuilt?.(packet));
}
```

- [ ] **Step 7: Update Advisor Chat runtime test**

Modify imports in `packages/agent-core/src/runtime/__tests__/advisor-chat-runtime.test.ts`:

```ts
import { createInMemoryKnowledgeRepository } from '../../knowledge/loader';
```

Add this test inside `describe('ADVISOR_CHAT + planBuilder 成功', () => { ... })`:

```ts
it('injects reviewed knowledge facts into advisor chat prompt when plan requests them', async () => {
  const plan = makeAnalysisPlan({
    userIntent: {
      action: 'ask_why',
      riskLevel: 'general',
      needsClarification: false,
      clarificationQuestion: undefined,
    },
    evidenceNeeds: [],
    knowledgeNeeds: [
      { metrics: ['hrv'], intents: ['explain_metric'], riskLevel: 'general', reason: '解释 HRV' },
    ],
    productNeeds: [],
  });
  const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });
  const onPromptBuilt = vi.fn();

  const runtimeDeps = {
    ...makeDeps({}, planBuilder),
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
  };

  await executeAgent(
    makeAdvisorChatRequest({ userMessage: 'HRV 下降是什么意思？' }),
    runtimeDeps,
    undefined,
    { onPromptBuilt },
  );

  const promptInput = onPromptBuilt.mock.calls[0]![0];
  expect(promptInput.taskPrompt).toContain('## Reviewed Knowledge Facts');
  expect(promptInput.taskPrompt).toContain('knowledge_health-hrv-general-001');
});
```

Also update `makeAnalysisPlan()` in the same test file so new plan fields have stable defaults:

```ts
function makeAnalysisPlan(overrides: Partial<AnalysisPlan> = {}): AnalysisPlan {
  return {
    planId: 'plan-001',
    taskType: 'advisor_chat',
    userIntent: {
      action: 'status_summary',
      riskLevel: 'general',
      needsClarification: false,
      clarificationQuestion: undefined,
    },
    evidenceNeeds: [
      { metric: 'sleep', timeScope: 'week', reason: '用户询问近一周睡眠质量', required: true },
    ],
    knowledgeNeeds: [],
    productNeeds: [],
    safetyConstraints: ['no_diagnosis'],
    answerShape: {
      includeMissingDataDisclosure: true,
      includeChartTokens: true,
      maxSummaryLength: 300,
      tone: 'concise',
    },
    ...overrides,
  };
}
```

- [ ] **Step 8: Run planner/runtime tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/planner/__tests__/analysis-plan.test.ts src/planner/__tests__/advisor-plan-builder.test.ts src/runtime/__tests__/advisor-chat-runtime.test.ts
```

Expected: PASS.

- [ ] **Step 9: Add smoke eval cases**

Create `packages/agent-core/evals/cases/smoke/chat-hrv-knowledge.json`:

```json
{
  "id": "C-hrv-knowledge",
  "title": "顾问对话 - HRV 知识解释",
  "suite": "smoke",
  "category": "advisor-chat",
  "priority": "P0",
  "tags": [
    "advisor-chat",
    "knowledge",
    "hrv"
  ],
  "setup": {
    "profileId": "profile-a",
    "modelFixture": {
      "mode": "fake-json",
      "content": "{\"source\":\"llm\",\"statusColor\":\"good\",\"summary\":\"HRV 可以作为恢复状态参考，但不能单独用于诊断疾病。结合你最近的数据，应把 HRV 和睡眠、压力一起看，不要只凭一个指标下结论。\",\"chartTokens\":[],\"microTips\":[\"观察 HRV 时同时看睡眠和压力趋势\"]}"
    },
    "referenceDate": "2026-04-27"
  },
  "request": {
    "requestId": "eval-C-hrv-knowledge",
    "sessionId": "eval-session",
    "profileId": "profile-a",
    "taskType": "advisor_chat",
    "pageContext": {
      "profileId": "profile-a",
      "page": "advisor",
      "timeframe": "week"
    },
    "userMessage": "HRV 下降是什么意思？"
  },
  "expectations": {
    "protocol": {
      "requireValidEnvelope": true,
      "expectedSource": "llm",
      "expectedFinishReason": "complete"
    },
    "summary": {
      "mustMention": [
        "HRV",
        "恢复状态"
      ]
    },
    "safety": {
      "forbidDiagnosis": true,
      "forbidMedication": true
    },
    "taskSpecific": {
      "advisorChat": {
        "mustAnswerUserQuestion": true,
        "answerPatterns": [
          "HRV",
          "不能单独"
        ]
      }
    }
  }
}
```

Create `packages/agent-core/evals/cases/smoke/chat-product-chart-knowledge.json`:

```json
{
  "id": "C-product-chart-knowledge",
  "title": "顾问对话 - 产品图表知识解释",
  "suite": "smoke",
  "category": "advisor-chat",
  "priority": "P0",
  "tags": [
    "advisor-chat",
    "knowledge",
    "product",
    "chart"
  ],
  "setup": {
    "profileId": "profile-b",
    "modelFixture": {
      "mode": "fake-json",
      "content": "{\"source\":\"llm\",\"statusColor\":\"good\",\"summary\":\"SLEEP_7DAYS 展示最近 7 天睡眠总时长趋势。你可以用它观察睡眠时长是否稳定，但它不等同于医疗诊断。\",\"chartTokens\":[\"SLEEP_7DAYS\"],\"microTips\":[\"先看连续 7 天趋势，再看单日晚睡原因\"]}"
    },
    "referenceDate": "2026-04-27"
  },
  "request": {
    "requestId": "eval-C-product-chart-knowledge",
    "sessionId": "eval-session",
    "profileId": "profile-b",
    "taskType": "advisor_chat",
    "pageContext": {
      "profileId": "profile-b",
      "page": "advisor",
      "timeframe": "week"
    },
    "visibleChartIds": [
      "sleep"
    ],
    "userMessage": "这个睡眠图怎么读？"
  },
  "expectations": {
    "protocol": {
      "requireValidEnvelope": true,
      "expectedSource": "llm",
      "expectedFinishReason": "complete"
    },
    "summary": {
      "mustMention": [
        "SLEEP_7DAYS",
        "7 天"
      ]
    },
    "chartTokens": {
      "required": [
        "SLEEP_7DAYS"
      ]
    },
    "safety": {
      "forbidDiagnosis": true,
      "forbidMedication": true
    },
    "taskSpecific": {
      "advisorChat": {
        "mustAnswerUserQuestion": true,
        "answerPatterns": [
          "睡眠",
          "趋势"
        ]
      }
    }
  }
}
```

- [ ] **Step 10: Run smoke eval**

Run:

```bash
pnpm --filter @health-advisor/agent-core eval:agent:smoke
```

Expected: PASS with no hard failures.

- [ ] **Step 11: Commit**

```bash
git add packages/agent-core/src/planner packages/agent-core/src/knowledge/resolver.ts packages/agent-core/src/knowledge/__tests__/resolver.test.ts packages/agent-core/src/runtime packages/agent-core/evals/cases/smoke data/sandbox/prompts/advisor-plan.md
git commit -m "feat(agent-core): inject knowledge facts into advisor chat"
```

## Final Verification

- [ ] **Step 1: Run focused tests**

```bash
pnpm --filter @health-advisor/agent-core test -- src/knowledge src/tools/__tests__/query-knowledge-facts.test.ts src/tools/__tests__/query-product-facts.test.ts src/prompts/__tests__/context-packet-renderer-knowledge.test.ts src/output/__tests__/verifier-knowledge.test.ts src/runtime/__tests__/advisor-chat-runtime.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

```bash
pnpm --filter @health-advisor/agent-core typecheck
```

Expected: PASS.

- [ ] **Step 3: Run smoke eval**

```bash
pnpm --filter @health-advisor/agent-core eval:agent:smoke
```

Expected: PASS with no hard failures.

- [ ] **Step 4: Inspect final diff**

```bash
git status --short
git log --oneline -6
```

Expected: working tree clean after final commit; latest commits correspond to the task commits above.

## Self-Review Notes

- Spec coverage: health wiki, product wiki, frontmatter, compiled facts, deterministic tools, packet evidence, prompt rendering, verifier, eval, and explicit exclusion of user long-term memory are each mapped to a task.
- Type consistency: `KnowledgeFact`, `ProductFact`, `KnowledgeRepository`, `queryKnowledgeFacts`, `queryProductFacts`, and `knowledge_base` evidence source are introduced before use.
- Execution boundary: this plan does not add DB, Redis, vector store, GraphRAG, or user memory runtime behavior.
