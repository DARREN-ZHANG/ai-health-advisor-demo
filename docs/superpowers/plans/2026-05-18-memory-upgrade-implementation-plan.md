# Memory Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Supabase-backed durable memory system for confirmed user facts, candidate confirmation, derived cache separation, and demo workflow outbox readiness.

**Architecture:** `agent-core` owns memory schemas, extraction contracts, validators, prompt-facing durable memory context, and in-memory test stores. `apps/agent-api` owns Supabase Postgres adapters, Fastify wiring, memory confirmation routes, and mock workflow outbox. `apps/web` displays candidate confirmation cards in the Advisor drawer and calls backend confirmation endpoints.

**Tech Stack:** TypeScript, Zod, Fastify, Vitest, Supabase Postgres via backend-owned SQL connection, Next.js, Zustand, TanStack Query.

---

## Scope Check

The approved design covers one connected subsystem: Agent durable memory. It includes storage, candidate extraction, confirmation, prompt injection, derived cache separation, and workflow outbox reservation. These pieces are not independent enough to split into separate implementation plans because the demo acceptance path depends on all of them:

```text
chat message -> candidate extraction -> confirmation UI -> durable fact -> later chat uses confirmed fact
```

This plan intentionally excludes real email delivery and production Auth. Those are future-readiness notes in the design, not current demo tasks.

## Module And Phase Breakdown

| Stage | Module | Outcome |
|---|---|---|
| Stage A | Shared and agent-core contracts | Memory candidate/fact types, schemas, validators, in-memory stores |
| Stage B | Supabase persistence | SQL migration, backend config, Supabase adapters |
| Stage C | Runtime and API integration | Extraction, chat response candidates, confirmation routes, context injection |
| Stage D | Frontend demo flow | Advisor confirmation cards and mutations |
| Stage E | Cache and workflow demo readiness | Derived cache boundary and mock workflow outbox |

## File Structure

Create or modify these files:

- `packages/shared/src/types/agent.ts`: add API-facing memory candidate confirmation type and optional response field.
- `packages/shared/src/schemas/agent.ts`: add Zod schema for the optional response field.
- `packages/shared/src/__tests__/schemas.test.ts`: cover schema parsing.
- `packages/agent-core/src/types/durable-memory.ts`: durable memory domain types and store interfaces.
- `packages/agent-core/src/memory/durable-memory-schema.ts`: Zod schemas for candidates, facts, revisions, cache, workflow records.
- `packages/agent-core/src/memory/memory-candidate-validator.ts`: deterministic candidate validation.
- `packages/agent-core/src/memory/in-memory-durable-memory-store.ts`: in-memory implementations for tests and local dev.
- `packages/agent-core/src/memory/memory-extraction-service.ts`: LLM-backed structured extractor contract and implementation.
- `packages/agent-core/src/memory/durable-memory-context.ts`: prompt-safe rendering of confirmed facts.
- `packages/agent-core/src/__tests__/memory/*.test.ts`: unit tests for schemas, validation, stores, extraction, prompt rendering.
- `packages/agent-core/src/types/agent-context.ts`: add confirmed durable facts to `context.memory`.
- `packages/agent-core/src/context/context-builder.ts`: accept preloaded durable facts.
- `packages/agent-core/src/runtime/agent-runtime.ts`: pre-load durable facts before building context.
- `packages/agent-core/src/prompts/task-builder.ts`: render confirmed durable facts separately from derived cache.
- `packages/agent-core/src/index.ts`: export new types and helpers.
- `data/sandbox/prompts/memory-extraction.md`: strict extraction prompt.
- `supabase/migrations/202605180001_memory_upgrade.sql`: Supabase Postgres schema.
- `apps/agent-api/package.json`: add SQL client dependency.
- `apps/agent-api/src/config/env.ts`: add memory persistence config.
- `apps/agent-api/src/persistence/supabase/client.ts`: SQL client creation.
- `apps/agent-api/src/persistence/supabase/memory-store.ts`: Supabase memory adapter.
- `apps/agent-api/src/persistence/supabase/workflow-store.ts`: Supabase workflow adapter.
- `apps/agent-api/src/persistence/supabase/cache-store.ts`: Supabase cache adapter.
- `apps/agent-api/src/runtime/memory-services.ts`: backend memory service factory.
- `apps/agent-api/src/types/fastify.d.ts`: decorate memory services.
- `apps/agent-api/src/app.ts`: initialize memory services and register memory routes.
- `apps/agent-api/src/modules/ai/routes.ts`: attach candidate extraction to chat response.
- `apps/agent-api/src/modules/memory/routes.ts`: list/confirm/reject candidate routes.
- `apps/agent-api/src/modules/workflows/routes.ts`: demo workflow routes for mock outbox.
- `apps/agent-api/src/__tests__/modules/memory/routes.test.ts`: memory API tests.
- `apps/agent-api/src/__tests__/persistence/supabase/memory-store.test.ts`: adapter tests using fake SQL executor.
- `apps/web/src/hooks/use-memory-query.ts`: memory confirmation mutations.
- `apps/web/src/stores/ai-advisor.store.ts`: store memory candidates on assistant messages.
- `apps/web/src/components/advisor/MemoryCandidateCard.tsx`: confirmation card.
- `apps/web/src/components/advisor/MessageBubble.tsx`: render candidate card under assistant message.
- `apps/web/src/components/advisor/AIAdvisorDrawer.tsx`: attach returned candidates to assistant message.
- `apps/web/src/lib/api-client.ts`: existing API client is reused.

## Task Cards

### Task 1: Shared API Contract For Memory Candidates

**Purpose:** Let `/ai/chat` return candidate confirmations without changing the existing core envelope semantics.

**Depends on:** Approved design.

**Files:**
- Modify: `packages/shared/src/types/agent.ts`
- Modify: `packages/shared/src/schemas/agent.ts`
- Modify: `packages/shared/src/__tests__/schemas.test.ts`

- [ ] **Step 1: Write schema test first**

Add this test block to `packages/shared/src/__tests__/schemas.test.ts` near existing agent schema tests:

```ts
import { describe, expect, it } from 'vitest';
import { AgentResponseEnvelopeSchema } from '../schemas/agent';
import { AgentTaskType } from '../types/agent';

describe('AgentResponseEnvelopeSchema memory candidates', () => {
  it('accepts optional memory candidate confirmations', () => {
    const result = AgentResponseEnvelopeSchema.safeParse({
      summary: '我会记住前先请你确认。',
      source: 'llm',
      statusColor: 'good',
      chartTokens: [],
      microTips: [],
      meta: {
        taskType: AgentTaskType.ADVISOR_CHAT,
        pageContext: { profileId: 'profile-a', page: 'homepage', timeframe: 'week' },
        finishReason: 'complete',
        sessionId: 'sess-1',
      },
      memoryCandidates: [
        {
          id: 'cand-1',
          kind: 'allergy',
          proposedConfirmationText: '是否记住：你对花生过敏？',
          evidenceQuote: '我对花生过敏',
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm --filter @health-advisor/shared test -- schemas.test.ts`

Expected: FAIL because `memoryCandidates` is not in the schema or type yet.

- [ ] **Step 3: Add shared types**

Add this to `packages/shared/src/types/agent.ts`:

```ts
export type MemoryCandidateKind =
  | 'allergy'
  | 'medical_constraint'
  | 'goal'
  | 'preference'
  | 'workflow_contact'
  | 'workflow_consent'
  | 'correction'
  | 'revocation';

export interface MemoryCandidateConfirmation {
  id: string;
  kind: MemoryCandidateKind;
  proposedConfirmationText: string;
  evidenceQuote: string;
}
```

Then add `memoryCandidates?: MemoryCandidateConfirmation[];` to `AgentResponseEnvelope`.

- [ ] **Step 4: Add shared schema**

Add this to `packages/shared/src/schemas/agent.ts`:

```ts
const MemoryCandidateKindSchema = z.enum([
  'allergy',
  'medical_constraint',
  'goal',
  'preference',
  'workflow_contact',
  'workflow_consent',
  'correction',
  'revocation',
]);

export const MemoryCandidateConfirmationSchema = z.object({
  id: z.string().min(1),
  kind: MemoryCandidateKindSchema,
  proposedConfirmationText: z.string().min(1),
  evidenceQuote: z.string().min(1),
});
```

Add this optional field to `AgentResponseEnvelopeSchema`:

```ts
memoryCandidates: z.array(MemoryCandidateConfirmationSchema).optional(),
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @health-advisor/shared test -- schemas.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types/agent.ts packages/shared/src/schemas/agent.ts packages/shared/src/__tests__/schemas.test.ts
git commit -m "feat(shared): add memory candidate response contract"
```

### Task 2: Agent-Core Durable Memory Domain

**Purpose:** Define durable memory records, candidate records, store interfaces, and narrow taxonomy inside `agent-core` without vendor imports.

**Depends on:** Task 1.

**Files:**
- Create: `packages/agent-core/src/types/durable-memory.ts`
- Create: `packages/agent-core/src/memory/durable-memory-schema.ts`
- Create: `packages/agent-core/src/__tests__/memory/durable-memory-schema.test.ts`
- Modify: `packages/agent-core/src/index.ts`

- [ ] **Step 1: Write schema tests**

Create `packages/agent-core/src/__tests__/memory/durable-memory-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  MemoryCandidateRecordSchema,
  UserMemoryFactSchema,
} from '../../memory/durable-memory-schema';

describe('durable memory schemas', () => {
  it('parses a pending allergy candidate with source evidence', () => {
    const result = MemoryCandidateRecordSchema.safeParse({
      id: 'cand-1',
      userScopeId: 'demo',
      profileId: 'profile-a',
      sessionId: 'sess-1',
      sourceMessageId: 'msg-1',
      kind: 'allergy',
      canonicalKey: 'allergy:peanut',
      payload: { allergen: 'peanut', severity: 'unknown' },
      evidenceQuote: '我对花生过敏',
      confidence: 'explicit',
      proposedConfirmationText: '是否记住：你对花生过敏？',
      status: 'pending',
      createdAt: 1760000000000,
      updatedAt: 1760000000000,
      expiresAt: 1760086400000,
    });

    expect(result.success).toBe(true);
  });

  it('parses an active confirmed durable fact', () => {
    const result = UserMemoryFactSchema.safeParse({
      id: 'fact-1',
      userScopeId: 'demo',
      profileId: 'profile-a',
      kind: 'allergy',
      canonicalKey: 'allergy:peanut',
      payload: { allergen: 'peanut', severity: 'unknown' },
      status: 'active',
      sensitivity: 'health',
      sourceCandidateId: 'cand-1',
      createdAt: 1760000000000,
      updatedAt: 1760000000000,
      revokedAt: undefined,
    });

    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm --filter @health-advisor/agent-core test -- durable-memory-schema.test.ts`

Expected: FAIL because schemas do not exist.

- [ ] **Step 3: Define types**

Create `packages/agent-core/src/types/durable-memory.ts` with these exports:

```ts
export type MemoryKind =
  | 'allergy'
  | 'medical_constraint'
  | 'goal'
  | 'preference'
  | 'workflow_contact'
  | 'workflow_consent'
  | 'correction'
  | 'revocation';

export type MemoryCandidateStatus = 'pending' | 'confirmed' | 'rejected' | 'expired' | 'superseded';
export type UserMemoryFactStatus = 'active' | 'revoked' | 'superseded';
export type MemoryConfidence = 'explicit' | 'ambiguous';
export type MemorySensitivity = 'standard' | 'health' | 'workflow';

export interface MemoryCandidateRecord {
  id: string;
  userScopeId: string;
  profileId: string;
  sessionId: string;
  sourceMessageId: string;
  kind: MemoryKind;
  canonicalKey: string;
  payload: Record<string, unknown>;
  evidenceQuote: string;
  confidence: MemoryConfidence;
  proposedConfirmationText: string;
  status: MemoryCandidateStatus;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

export interface UserMemoryFact {
  id: string;
  userScopeId: string;
  profileId: string;
  kind: MemoryKind;
  canonicalKey: string;
  payload: Record<string, unknown>;
  status: UserMemoryFactStatus;
  sensitivity: MemorySensitivity;
  sourceCandidateId: string;
  createdAt: number;
  updatedAt: number;
  revokedAt?: number;
}

export interface MemoryRevision {
  id: string;
  memoryFactId: string;
  revisionType: 'create' | 'update' | 'revoke' | 'supersede';
  previousPayload?: Record<string, unknown>;
  nextPayload?: Record<string, unknown>;
  sourceCandidateId: string;
  createdAt: number;
}

export interface MemoryCandidateStore {
  saveCandidate(candidate: MemoryCandidateRecord): Promise<MemoryCandidateRecord>;
  listPending(input: { userScopeId: string; profileId: string; sessionId?: string; now: number }): Promise<MemoryCandidateRecord[]>;
  getCandidate(id: string): Promise<MemoryCandidateRecord | undefined>;
  setCandidateStatus(id: string, status: MemoryCandidateStatus, updatedAt: number): Promise<MemoryCandidateRecord>;
}

export interface DurableMemoryStore {
  listActiveFacts(input: { userScopeId: string; profileId: string }): Promise<UserMemoryFact[]>;
  confirmCandidate(input: { candidate: MemoryCandidateRecord; now: number }): Promise<{ fact: UserMemoryFact; revision: MemoryRevision }>;
  revokeFact(input: { factId: string; sourceCandidateId: string; now: number }): Promise<MemoryRevision>;
}
```

- [ ] **Step 4: Define Zod schemas**

Create `packages/agent-core/src/memory/durable-memory-schema.ts`:

```ts
import { z } from 'zod';

export const MemoryKindSchema = z.enum([
  'allergy',
  'medical_constraint',
  'goal',
  'preference',
  'workflow_contact',
  'workflow_consent',
  'correction',
  'revocation',
]);

export const MemoryCandidateRecordSchema = z.object({
  id: z.string().min(1),
  userScopeId: z.string().min(1),
  profileId: z.string().min(1),
  sessionId: z.string().min(1),
  sourceMessageId: z.string().min(1),
  kind: MemoryKindSchema,
  canonicalKey: z.string().min(1),
  payload: z.record(z.unknown()),
  evidenceQuote: z.string().min(1),
  confidence: z.enum(['explicit', 'ambiguous']),
  proposedConfirmationText: z.string().min(1),
  status: z.enum(['pending', 'confirmed', 'rejected', 'expired', 'superseded']),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
});

export const UserMemoryFactSchema = z.object({
  id: z.string().min(1),
  userScopeId: z.string().min(1),
  profileId: z.string().min(1),
  kind: MemoryKindSchema,
  canonicalKey: z.string().min(1),
  payload: z.record(z.unknown()),
  status: z.enum(['active', 'revoked', 'superseded']),
  sensitivity: z.enum(['standard', 'health', 'workflow']),
  sourceCandidateId: z.string().min(1),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  revokedAt: z.number().int().positive().optional(),
});
```

- [ ] **Step 5: Export types and schemas**

Add exports to `packages/agent-core/src/index.ts`:

```ts
export type {
  MemoryKind,
  MemoryCandidateStatus,
  UserMemoryFactStatus,
  MemoryConfidence,
  MemorySensitivity,
  MemoryCandidateRecord,
  UserMemoryFact,
  MemoryRevision,
  MemoryCandidateStore,
  DurableMemoryStore,
} from './types/durable-memory';

export {
  MemoryKindSchema,
  MemoryCandidateRecordSchema,
  UserMemoryFactSchema,
} from './memory/durable-memory-schema';
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @health-advisor/agent-core test -- durable-memory-schema.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/agent-core/src/types/durable-memory.ts packages/agent-core/src/memory/durable-memory-schema.ts packages/agent-core/src/__tests__/memory/durable-memory-schema.test.ts packages/agent-core/src/index.ts
git commit -m "feat(agent-core): add durable memory domain model"
```

### Task 3: Deterministic Candidate Validator

**Purpose:** Enforce that extracted memory is user-declared, evidence-backed, taxonomy-limited, and confirmation-required.

**Depends on:** Task 2.

**Files:**
- Create: `packages/agent-core/src/memory/memory-candidate-validator.ts`
- Create: `packages/agent-core/src/__tests__/memory/memory-candidate-validator.test.ts`
- Modify: `packages/agent-core/src/index.ts`

- [ ] **Step 1: Write validator tests**

Create `packages/agent-core/src/__tests__/memory/memory-candidate-validator.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validateExtractedMemoryCandidate } from '../../memory/memory-candidate-validator';

const base = {
  kind: 'allergy' as const,
  canonicalKey: 'allergy:peanut',
  payload: { allergen: 'peanut', severity: 'unknown' },
  evidenceQuote: '我对花生过敏',
  source: 'user_declared' as const,
  confidence: 'explicit' as const,
  proposedConfirmationText: '是否记住：你对花生过敏？',
  requiresConfirmation: true,
};

describe('validateExtractedMemoryCandidate', () => {
  it('accepts explicit user-declared evidence-backed candidates', () => {
    expect(validateExtractedMemoryCandidate(base)).toEqual({ valid: true });
  });

  it('rejects inferred candidates', () => {
    expect(validateExtractedMemoryCandidate({ ...base, source: 'model_inferred' })).toEqual({
      valid: false,
      reason: 'source_not_user_declared',
    });
  });

  it('rejects candidates without evidence quote', () => {
    expect(validateExtractedMemoryCandidate({ ...base, evidenceQuote: '' })).toEqual({
      valid: false,
      reason: 'missing_evidence_quote',
    });
  });

  it('rejects candidates that do not require confirmation', () => {
    expect(validateExtractedMemoryCandidate({ ...base, requiresConfirmation: false })).toEqual({
      valid: false,
      reason: 'confirmation_required',
    });
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm --filter @health-advisor/agent-core test -- memory-candidate-validator.test.ts`

Expected: FAIL because validator does not exist.

- [ ] **Step 3: Implement validator**

Create `packages/agent-core/src/memory/memory-candidate-validator.ts`:

```ts
import { MemoryKindSchema } from './durable-memory-schema';

export interface ExtractedMemoryCandidate {
  kind: string;
  canonicalKey: string;
  payload: Record<string, unknown>;
  evidenceQuote: string;
  source: 'user_declared' | 'model_inferred' | 'sensor_inferred';
  confidence: 'explicit' | 'ambiguous';
  proposedConfirmationText: string;
  requiresConfirmation: boolean;
}

export type CandidateValidationResult =
  | { valid: true }
  | {
      valid: false;
      reason:
        | 'unsupported_kind'
        | 'missing_canonical_key'
        | 'missing_evidence_quote'
        | 'source_not_user_declared'
        | 'confirmation_required'
        | 'missing_confirmation_text';
    };

export function validateExtractedMemoryCandidate(
  candidate: ExtractedMemoryCandidate,
): CandidateValidationResult {
  if (!MemoryKindSchema.safeParse(candidate.kind).success) {
    return { valid: false, reason: 'unsupported_kind' };
  }
  if (candidate.canonicalKey.trim().length === 0) {
    return { valid: false, reason: 'missing_canonical_key' };
  }
  if (candidate.evidenceQuote.trim().length === 0) {
    return { valid: false, reason: 'missing_evidence_quote' };
  }
  if (candidate.source !== 'user_declared') {
    return { valid: false, reason: 'source_not_user_declared' };
  }
  if (!candidate.requiresConfirmation) {
    return { valid: false, reason: 'confirmation_required' };
  }
  if (candidate.proposedConfirmationText.trim().length === 0) {
    return { valid: false, reason: 'missing_confirmation_text' };
  }
  return { valid: true };
}
```

- [ ] **Step 4: Export validator**

Add to `packages/agent-core/src/index.ts`:

```ts
export { validateExtractedMemoryCandidate } from './memory/memory-candidate-validator';
export type { ExtractedMemoryCandidate, CandidateValidationResult } from './memory/memory-candidate-validator';
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @health-advisor/agent-core test -- memory-candidate-validator.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/memory/memory-candidate-validator.ts packages/agent-core/src/__tests__/memory/memory-candidate-validator.test.ts packages/agent-core/src/index.ts
git commit -m "feat(agent-core): validate memory candidates"
```

### Task 4: In-Memory Stores For Local Dev And Tests

**Purpose:** Provide testable store implementations before adding Supabase adapters.

**Depends on:** Task 2 and Task 3.

**Files:**
- Create: `packages/agent-core/src/memory/in-memory-durable-memory-store.ts`
- Create: `packages/agent-core/src/__tests__/memory/in-memory-durable-memory-store.test.ts`
- Modify: `packages/agent-core/src/index.ts`

- [ ] **Step 1: Write store tests**

Create `packages/agent-core/src/__tests__/memory/in-memory-durable-memory-store.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { InMemoryDurableMemoryStore } from '../../memory/in-memory-durable-memory-store';
import type { MemoryCandidateRecord } from '../../types/durable-memory';

function candidate(overrides: Partial<MemoryCandidateRecord> = {}): MemoryCandidateRecord {
  return {
    id: 'cand-1',
    userScopeId: 'demo',
    profileId: 'profile-a',
    sessionId: 'sess-1',
    sourceMessageId: 'msg-1',
    kind: 'allergy',
    canonicalKey: 'allergy:peanut',
    payload: { allergen: 'peanut', severity: 'unknown' },
    evidenceQuote: '我对花生过敏',
    confidence: 'explicit',
    proposedConfirmationText: '是否记住：你对花生过敏？',
    status: 'pending',
    createdAt: 1760000000000,
    updatedAt: 1760000000000,
    expiresAt: 1760086400000,
    ...overrides,
  };
}

describe('InMemoryDurableMemoryStore', () => {
  it('lists only pending candidates for the requested profile', async () => {
    const store = new InMemoryDurableMemoryStore();
    await store.saveCandidate(candidate());
    await store.saveCandidate(candidate({ id: 'cand-2', profileId: 'profile-b' }));

    const pending = await store.listPending({
      userScopeId: 'demo',
      profileId: 'profile-a',
      now: 1760000000001,
    });

    expect(pending.map((item) => item.id)).toEqual(['cand-1']);
  });

  it('confirms a candidate into one active fact and one revision', async () => {
    const store = new InMemoryDurableMemoryStore();
    const saved = await store.saveCandidate(candidate());

    const result = await store.confirmCandidate({ candidate: saved, now: 1760000001000 });
    const facts = await store.listActiveFacts({ userScopeId: 'demo', profileId: 'profile-a' });

    expect(result.fact.canonicalKey).toBe('allergy:peanut');
    expect(result.revision.revisionType).toBe('create');
    expect(facts).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm --filter @health-advisor/agent-core test -- in-memory-durable-memory-store.test.ts`

Expected: FAIL because store does not exist.

- [ ] **Step 3: Implement in-memory store**

Create `packages/agent-core/src/memory/in-memory-durable-memory-store.ts`:

```ts
import type {
  DurableMemoryStore,
  MemoryCandidateRecord,
  MemoryCandidateStatus,
  MemoryCandidateStore,
  MemoryRevision,
  UserMemoryFact,
} from '../types/durable-memory';

export class InMemoryDurableMemoryStore implements MemoryCandidateStore, DurableMemoryStore {
  private candidates = new Map<string, MemoryCandidateRecord>();
  private facts = new Map<string, UserMemoryFact>();
  private revisions = new Map<string, MemoryRevision>();

  async saveCandidate(candidate: MemoryCandidateRecord): Promise<MemoryCandidateRecord> {
    this.candidates.set(candidate.id, candidate);
    return candidate;
  }

  async listPending(input: {
    userScopeId: string;
    profileId: string;
    sessionId?: string;
    now: number;
  }): Promise<MemoryCandidateRecord[]> {
    return Array.from(this.candidates.values()).filter((candidate) => {
      return candidate.userScopeId === input.userScopeId
        && candidate.profileId === input.profileId
        && candidate.status === 'pending'
        && candidate.expiresAt > input.now
        && (!input.sessionId || candidate.sessionId === input.sessionId);
    });
  }

  async getCandidate(id: string): Promise<MemoryCandidateRecord | undefined> {
    return this.candidates.get(id);
  }

  async setCandidateStatus(
    id: string,
    status: MemoryCandidateStatus,
    updatedAt: number,
  ): Promise<MemoryCandidateRecord> {
    const existing = this.candidates.get(id);
    if (!existing) throw new Error(`Memory candidate not found: ${id}`);
    const updated = { ...existing, status, updatedAt };
    this.candidates.set(id, updated);
    return updated;
  }

  async listActiveFacts(input: { userScopeId: string; profileId: string }): Promise<UserMemoryFact[]> {
    return Array.from(this.facts.values()).filter((fact) => {
      return fact.userScopeId === input.userScopeId
        && fact.profileId === input.profileId
        && fact.status === 'active';
    });
  }

  async confirmCandidate(input: {
    candidate: MemoryCandidateRecord;
    now: number;
  }): Promise<{ fact: UserMemoryFact; revision: MemoryRevision }> {
    const factId = `fact-${input.candidate.id}`;
    const revisionId = `rev-${input.candidate.id}`;
    const fact: UserMemoryFact = {
      id: factId,
      userScopeId: input.candidate.userScopeId,
      profileId: input.candidate.profileId,
      kind: input.candidate.kind,
      canonicalKey: input.candidate.canonicalKey,
      payload: input.candidate.payload,
      status: 'active',
      sensitivity: input.candidate.kind === 'allergy' || input.candidate.kind === 'medical_constraint'
        ? 'health'
        : input.candidate.kind.startsWith('workflow_')
          ? 'workflow'
          : 'standard',
      sourceCandidateId: input.candidate.id,
      createdAt: input.now,
      updatedAt: input.now,
    };
    const revision: MemoryRevision = {
      id: revisionId,
      memoryFactId: factId,
      revisionType: 'create',
      nextPayload: fact.payload,
      sourceCandidateId: input.candidate.id,
      createdAt: input.now,
    };
    this.facts.set(fact.id, fact);
    this.revisions.set(revision.id, revision);
    await this.setCandidateStatus(input.candidate.id, 'confirmed', input.now);
    return { fact, revision };
  }

  async revokeFact(input: {
    factId: string;
    sourceCandidateId: string;
    now: number;
  }): Promise<MemoryRevision> {
    const existing = this.facts.get(input.factId);
    if (!existing) throw new Error(`Memory fact not found: ${input.factId}`);
    const revoked: UserMemoryFact = {
      ...existing,
      status: 'revoked',
      updatedAt: input.now,
      revokedAt: input.now,
    };
    this.facts.set(input.factId, revoked);
    const revision: MemoryRevision = {
      id: `rev-${input.factId}-${input.now}`,
      memoryFactId: input.factId,
      revisionType: 'revoke',
      previousPayload: existing.payload,
      sourceCandidateId: input.sourceCandidateId,
      createdAt: input.now,
    };
    this.revisions.set(revision.id, revision);
    return revision;
  }
}
```

- [ ] **Step 4: Export store**

Add to `packages/agent-core/src/index.ts`:

```ts
export { InMemoryDurableMemoryStore } from './memory/in-memory-durable-memory-store';
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @health-advisor/agent-core test -- in-memory-durable-memory-store.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/memory/in-memory-durable-memory-store.ts packages/agent-core/src/__tests__/memory/in-memory-durable-memory-store.test.ts packages/agent-core/src/index.ts
git commit -m "feat(agent-core): add in-memory durable memory store"
```

### Task 5: Supabase Postgres Schema And Backend Config

**Purpose:** Add the demo SQL schema and backend config for Supabase Postgres without introducing Supabase Auth or frontend direct database access.

**Depends on:** Task 2.

**Files:**
- Create: `supabase/migrations/202605180001_memory_upgrade.sql`
- Modify: `apps/agent-api/package.json`
- Modify: `apps/agent-api/src/config/env.ts`
- Modify: `apps/agent-api/src/__tests__/config/env.test.ts`

- [ ] **Step 1: Add SQL client dependency**

Run: `pnpm --filter @health-advisor/agent-api add postgres`

Expected: `apps/agent-api/package.json` includes `"postgres"`.

- [ ] **Step 2: Add Supabase migration**

Create `supabase/migrations/202605180001_memory_upgrade.sql`:

```sql
create extension if not exists pgcrypto;

create table if not exists memory_candidates (
  id uuid primary key default gen_random_uuid(),
  user_scope_id text not null,
  profile_id text not null,
  session_id text not null,
  source_message_id text not null,
  kind text not null check (kind in ('allergy', 'medical_constraint', 'goal', 'preference', 'workflow_contact', 'workflow_consent', 'correction', 'revocation')),
  canonical_key text not null,
  payload_json jsonb not null,
  evidence_quote text not null,
  confidence text not null check (confidence in ('explicit', 'ambiguous')),
  proposed_confirmation_text text not null,
  status text not null check (status in ('pending', 'confirmed', 'rejected', 'expired', 'superseded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists memory_candidates_pending_idx
  on memory_candidates (user_scope_id, profile_id, session_id, status, expires_at);

create table if not exists user_memory_facts (
  id uuid primary key default gen_random_uuid(),
  user_scope_id text not null,
  profile_id text not null,
  kind text not null check (kind in ('allergy', 'medical_constraint', 'goal', 'preference', 'workflow_contact', 'workflow_consent', 'correction', 'revocation')),
  canonical_key text not null,
  payload_json jsonb not null,
  status text not null check (status in ('active', 'revoked', 'superseded')),
  sensitivity text not null check (sensitivity in ('standard', 'health', 'workflow')),
  source_candidate_id uuid not null references memory_candidates(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_scope_id, profile_id, canonical_key, status)
);

create index if not exists user_memory_facts_active_idx
  on user_memory_facts (user_scope_id, profile_id, status);

create table if not exists memory_revisions (
  id uuid primary key default gen_random_uuid(),
  memory_fact_id uuid not null references user_memory_facts(id),
  revision_type text not null check (revision_type in ('create', 'update', 'revoke', 'supersede')),
  previous_payload_json jsonb,
  next_payload_json jsonb,
  source_candidate_id uuid not null references memory_candidates(id),
  created_at timestamptz not null default now()
);

create table if not exists workflow_contacts (
  id uuid primary key default gen_random_uuid(),
  user_scope_id text not null,
  profile_id text not null,
  contact_type text not null check (contact_type in ('therapist', 'coach', 'doctor', 'caregiver', 'other')),
  display_name text not null,
  email text,
  phone text,
  metadata_json jsonb not null default '{}'::jsonb,
  status text not null check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workflow_consents (
  id uuid primary key default gen_random_uuid(),
  user_scope_id text not null,
  profile_id text not null,
  workflow_type text not null,
  contact_id uuid references workflow_contacts(id),
  scope_json jsonb not null,
  status text not null check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists workflow_outbox (
  id uuid primary key default gen_random_uuid(),
  user_scope_id text not null,
  profile_id text not null,
  workflow_type text not null,
  contact_id uuid references workflow_contacts(id),
  consent_id uuid references workflow_consents(id),
  payload_json jsonb not null,
  status text not null check (status in ('pending', 'processing', 'sent', 'cancelled', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists workflow_events (
  id uuid primary key default gen_random_uuid(),
  workflow_outbox_id uuid references workflow_outbox(id),
  event_type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists agent_cache_entries (
  id uuid primary key default gen_random_uuid(),
  cache_type text not null,
  profile_id text not null,
  session_id text,
  cache_key text not null,
  data_fingerprint text not null,
  prompt_version text not null,
  model_version text not null,
  locale text not null,
  page_context_json jsonb not null,
  payload_json jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (cache_type, profile_id, cache_key, data_fingerprint, prompt_version, model_version, locale)
);
```

- [ ] **Step 3: Write config tests**

Add to `apps/agent-api/src/__tests__/config/env.test.ts`:

```ts
it('defaults memory backend to in-memory mode', () => {
  const config = loadConfig({ FALLBACK_ONLY_MODE: 'true' });
  expect(config.MEMORY_BACKEND).toBe('memory');
});

it('requires SUPABASE_DB_URL when MEMORY_BACKEND is supabase', () => {
  expect(() => loadConfig({
    FALLBACK_ONLY_MODE: 'true',
    MEMORY_BACKEND: 'supabase',
  })).toThrow(/SUPABASE_DB_URL/);
});
```

- [ ] **Step 4: Add config values**

In `apps/agent-api/src/config/env.ts`, add these fields to `AppConfigSchema`:

```ts
MEMORY_BACKEND: z.enum(['memory', 'supabase']).default('memory'),
SUPABASE_DB_URL: z.string().optional(),
MEMORY_EXTRACTION_ENABLED: envBool.default('false'),
MEMORY_CANDIDATE_TTL_HOURS: z.coerce.number().positive().default(24),
DEMO_USER_SCOPE_ID: z.string().min(1).default('demo'),
```

Add this refine after the LLM key refine:

```ts
.refine(
  (data) => data.MEMORY_BACKEND !== 'supabase' || Boolean(data.SUPABASE_DB_URL),
  { message: 'SUPABASE_DB_URL is required when MEMORY_BACKEND is supabase', path: ['SUPABASE_DB_URL'] },
)
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @health-advisor/agent-api test -- env.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/202605180001_memory_upgrade.sql apps/agent-api/package.json pnpm-lock.yaml apps/agent-api/src/config/env.ts apps/agent-api/src/__tests__/config/env.test.ts
git commit -m "feat(agent-api): add Supabase memory schema config"
```

### Task 6: Supabase Persistence Adapters

**Purpose:** Implement backend-owned Supabase Postgres adapters behind `agent-core` store interfaces.

**Depends on:** Task 4 and Task 5.

**Files:**
- Create: `apps/agent-api/src/persistence/supabase/client.ts`
- Create: `apps/agent-api/src/persistence/supabase/memory-store.ts`
- Create: `apps/agent-api/src/__tests__/persistence/supabase/memory-store.test.ts`

- [ ] **Step 1: Write adapter tests with fake SQL executor**

Create `apps/agent-api/src/__tests__/persistence/supabase/memory-store.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SupabaseMemoryStore } from '../../../persistence/supabase/memory-store';
import type { MemoryCandidateRecord } from '@health-advisor/agent-core';

class FakeSql {
  rows: unknown[] = [];
  lastQuery = '';

  async query<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> {
    this.lastQuery = strings.join('?');
    if (this.lastQuery.includes('insert into memory_candidates')) return [this.rows[0] as T];
    if (this.lastQuery.includes('from memory_candidates')) return this.rows as T[];
    if (this.lastQuery.includes('from user_memory_facts')) return this.rows as T[];
    if (this.lastQuery.includes('update memory_candidates')) return [this.rows[0] as T];
    return [];
  }
}

function candidate(): MemoryCandidateRecord {
  return {
    id: 'cand-1',
    userScopeId: 'demo',
    profileId: 'profile-a',
    sessionId: 'sess-1',
    sourceMessageId: 'msg-1',
    kind: 'allergy',
    canonicalKey: 'allergy:peanut',
    payload: { allergen: 'peanut' },
    evidenceQuote: '我对花生过敏',
    confidence: 'explicit',
    proposedConfirmationText: '是否记住：你对花生过敏？',
    status: 'pending',
    createdAt: 1760000000000,
    updatedAt: 1760000000000,
    expiresAt: 1760086400000,
  };
}

describe('SupabaseMemoryStore', () => {
  it('saves candidates through memory_candidates table', async () => {
    const sql = new FakeSql();
    sql.rows = [candidate()];
    const store = new SupabaseMemoryStore(sql);

    const saved = await store.saveCandidate(candidate());

    expect(saved.id).toBe('cand-1');
    expect(sql.lastQuery).toContain('insert into memory_candidates');
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm --filter @health-advisor/agent-api test -- memory-store.test.ts`

Expected: FAIL because adapter does not exist.

- [ ] **Step 3: Create SQL client wrapper**

Create `apps/agent-api/src/persistence/supabase/client.ts`:

```ts
import postgres from 'postgres';

export interface SqlExecutor {
  query<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
}

export function createSupabaseSql(databaseUrl: string): SqlExecutor {
  const sql = postgres(databaseUrl, { prepare: false });
  return {
    query<T>(strings: TemplateStringsArray, ...values: unknown[]) {
      return sql<T[]>(strings, ...values);
    },
  };
}
```

- [ ] **Step 4: Implement memory adapter**

Create `apps/agent-api/src/persistence/supabase/memory-store.ts` with mapping functions and interface methods:

```ts
import type {
  DurableMemoryStore,
  MemoryCandidateRecord,
  MemoryCandidateStatus,
  MemoryCandidateStore,
  MemoryRevision,
  UserMemoryFact,
} from '@health-advisor/agent-core';
import type { SqlExecutor } from './client.js';

function fromCandidateRow(row: Record<string, unknown>): MemoryCandidateRecord {
  return {
    id: String(row.id),
    userScopeId: String(row.user_scope_id),
    profileId: String(row.profile_id),
    sessionId: String(row.session_id),
    sourceMessageId: String(row.source_message_id),
    kind: row.kind as MemoryCandidateRecord['kind'],
    canonicalKey: String(row.canonical_key),
    payload: row.payload_json as Record<string, unknown>,
    evidenceQuote: String(row.evidence_quote),
    confidence: row.confidence as MemoryCandidateRecord['confidence'],
    proposedConfirmationText: String(row.proposed_confirmation_text),
    status: row.status as MemoryCandidateRecord['status'],
    createdAt: new Date(String(row.created_at)).getTime(),
    updatedAt: new Date(String(row.updated_at)).getTime(),
    expiresAt: new Date(String(row.expires_at)).getTime(),
  };
}

function fromFactRow(row: Record<string, unknown>): UserMemoryFact {
  return {
    id: String(row.id),
    userScopeId: String(row.user_scope_id),
    profileId: String(row.profile_id),
    kind: row.kind as UserMemoryFact['kind'],
    canonicalKey: String(row.canonical_key),
    payload: row.payload_json as Record<string, unknown>,
    status: row.status as UserMemoryFact['status'],
    sensitivity: row.sensitivity as UserMemoryFact['sensitivity'],
    sourceCandidateId: String(row.source_candidate_id),
    createdAt: new Date(String(row.created_at)).getTime(),
    updatedAt: new Date(String(row.updated_at)).getTime(),
    revokedAt: row.revoked_at ? new Date(String(row.revoked_at)).getTime() : undefined,
  };
}

function fromRevisionRow(row: Record<string, unknown>): MemoryRevision {
  return {
    id: String(row.id),
    memoryFactId: String(row.memory_fact_id),
    revisionType: row.revision_type as MemoryRevision['revisionType'],
    previousPayload: row.previous_payload_json as Record<string, unknown> | undefined,
    nextPayload: row.next_payload_json as Record<string, unknown> | undefined,
    sourceCandidateId: String(row.source_candidate_id),
    createdAt: new Date(String(row.created_at)).getTime(),
  };
}

function sensitivityForKind(kind: MemoryCandidateRecord['kind']): UserMemoryFact['sensitivity'] {
  if (kind === 'allergy' || kind === 'medical_constraint') return 'health';
  if (kind === 'workflow_contact' || kind === 'workflow_consent') return 'workflow';
  return 'standard';
}

export class SupabaseMemoryStore implements MemoryCandidateStore, DurableMemoryStore {
  constructor(private readonly sql: SqlExecutor) {}

  async saveCandidate(candidate: MemoryCandidateRecord): Promise<MemoryCandidateRecord> {
    const rows = await this.sql.query<Record<string, unknown>>`
      insert into memory_candidates (
        id, user_scope_id, profile_id, session_id, source_message_id,
        kind, canonical_key, payload_json, evidence_quote, confidence,
        proposed_confirmation_text, status, created_at, updated_at, expires_at
      )
      values (
        ${candidate.id}, ${candidate.userScopeId}, ${candidate.profileId}, ${candidate.sessionId},
        ${candidate.sourceMessageId}, ${candidate.kind}, ${candidate.canonicalKey}, ${candidate.payload},
        ${candidate.evidenceQuote}, ${candidate.confidence}, ${candidate.proposedConfirmationText},
        ${candidate.status}, ${new Date(candidate.createdAt)}, ${new Date(candidate.updatedAt)},
        ${new Date(candidate.expiresAt)}
      )
      returning *
    `;
    return fromCandidateRow(rows[0]!);
  }

  async listPending(input: {
    userScopeId: string;
    profileId: string;
    sessionId?: string;
    now: number;
  }): Promise<MemoryCandidateRecord[]> {
    const rows = input.sessionId
      ? await this.sql.query<Record<string, unknown>>`
          select * from memory_candidates
          where user_scope_id = ${input.userScopeId}
            and profile_id = ${input.profileId}
            and session_id = ${input.sessionId}
            and status = 'pending'
            and expires_at > ${new Date(input.now)}
          order by created_at desc
        `
      : await this.sql.query<Record<string, unknown>>`
          select * from memory_candidates
          where user_scope_id = ${input.userScopeId}
            and profile_id = ${input.profileId}
            and status = 'pending'
            and expires_at > ${new Date(input.now)}
          order by created_at desc
        `;
    return rows.map(fromCandidateRow);
  }

  async getCandidate(id: string): Promise<MemoryCandidateRecord | undefined> {
    const rows = await this.sql.query<Record<string, unknown>>`
      select * from memory_candidates where id = ${id} limit 1
    `;
    return rows[0] ? fromCandidateRow(rows[0]) : undefined;
  }

  async setCandidateStatus(
    id: string,
    status: MemoryCandidateStatus,
    updatedAt: number,
  ): Promise<MemoryCandidateRecord> {
    const rows = await this.sql.query<Record<string, unknown>>`
      update memory_candidates
      set status = ${status}, updated_at = ${new Date(updatedAt)}
      where id = ${id}
      returning *
    `;
    return fromCandidateRow(rows[0]!);
  }

  async listActiveFacts(input: { userScopeId: string; profileId: string }): Promise<UserMemoryFact[]> {
    const rows = await this.sql.query<Record<string, unknown>>`
      select * from user_memory_facts
      where user_scope_id = ${input.userScopeId}
        and profile_id = ${input.profileId}
        and status = 'active'
      order by created_at asc
    `;
    return rows.map(fromFactRow);
  }

  async confirmCandidate(input: {
    candidate: MemoryCandidateRecord;
    now: number;
  }): Promise<{ fact: UserMemoryFact; revision: MemoryRevision }> {
    const factRows = await this.sql.query<Record<string, unknown>>`
      insert into user_memory_facts (
        user_scope_id, profile_id, kind, canonical_key, payload_json,
        status, sensitivity, source_candidate_id, created_at, updated_at
      )
      values (
        ${input.candidate.userScopeId}, ${input.candidate.profileId}, ${input.candidate.kind},
        ${input.candidate.canonicalKey}, ${input.candidate.payload}, 'active',
        ${sensitivityForKind(input.candidate.kind)}, ${input.candidate.id},
        ${new Date(input.now)}, ${new Date(input.now)}
      )
      on conflict (user_scope_id, profile_id, canonical_key, status)
      do update set
        payload_json = excluded.payload_json,
        source_candidate_id = excluded.source_candidate_id,
        updated_at = excluded.updated_at
      returning *
    `;
    const fact = fromFactRow(factRows[0]!);

    const revisionRows = await this.sql.query<Record<string, unknown>>`
      insert into memory_revisions (
        memory_fact_id, revision_type, previous_payload_json, next_payload_json,
        source_candidate_id, created_at
      )
      values (
        ${fact.id}, 'create', null, ${fact.payload}, ${input.candidate.id}, ${new Date(input.now)}
      )
      returning *
    `;
    await this.setCandidateStatus(input.candidate.id, 'confirmed', input.now);
    return { fact, revision: fromRevisionRow(revisionRows[0]!) };
  }

  async revokeFact(input: {
    factId: string;
    sourceCandidateId: string;
    now: number;
  }): Promise<MemoryRevision> {
    const factRows = await this.sql.query<Record<string, unknown>>`
      update user_memory_facts
      set status = 'revoked', updated_at = ${new Date(input.now)}, revoked_at = ${new Date(input.now)}
      where id = ${input.factId}
      returning *
    `;
    const revokedFact = fromFactRow(factRows[0]!);
    const revisionRows = await this.sql.query<Record<string, unknown>>`
      insert into memory_revisions (
        memory_fact_id, revision_type, previous_payload_json, next_payload_json,
        source_candidate_id, created_at
      )
      values (
        ${input.factId}, 'revoke', ${revokedFact.payload}, null,
        ${input.sourceCandidateId}, ${new Date(input.now)}
      )
      returning *
    `;
    return fromRevisionRow(revisionRows[0]!);
  }
}
```

- [ ] **Step 5: Run adapter test**

Run: `pnpm --filter @health-advisor/agent-api test -- memory-store.test.ts`

Expected: PASS for save/list/confirm/revoke mapping tests.

- [ ] **Step 6: Commit**

```bash
git add apps/agent-api/src/persistence/supabase/client.ts apps/agent-api/src/persistence/supabase/memory-store.ts apps/agent-api/src/__tests__/persistence/supabase/memory-store.test.ts
git commit -m "feat(agent-api): add Supabase memory adapter"
```

### Task 7: Backend Memory Service Factory

**Purpose:** Initialize memory stores from config and decorate Fastify so routes can use memory services.

**Depends on:** Task 4, Task 5, Task 6.

**Files:**
- Create: `apps/agent-api/src/runtime/memory-services.ts`
- Modify: `apps/agent-api/src/types/fastify.d.ts`
- Modify: `apps/agent-api/src/app.ts`
- Create: `apps/agent-api/src/__tests__/runtime/memory-services.test.ts`

- [ ] **Step 1: Write factory tests**

Create `apps/agent-api/src/__tests__/runtime/memory-services.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createMemoryServices } from '../../runtime/memory-services';

describe('createMemoryServices', () => {
  it('creates in-memory services by default', () => {
    const services = createMemoryServices({
      MEMORY_BACKEND: 'memory',
      MEMORY_CANDIDATE_TTL_HOURS: 24,
      DEMO_USER_SCOPE_ID: 'demo',
    });

    expect(services.userScopeId).toBe('demo');
    expect(services.candidates).toBeDefined();
    expect(services.durable).toBeDefined();
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `pnpm --filter @health-advisor/agent-api test -- memory-services.test.ts`

Expected: FAIL because service factory does not exist.

- [ ] **Step 3: Implement factory**

Create `apps/agent-api/src/runtime/memory-services.ts`:

```ts
import {
  InMemoryDurableMemoryStore,
  type DurableMemoryStore,
  type MemoryCandidateStore,
} from '@health-advisor/agent-core';
import { createSupabaseSql } from '../persistence/supabase/client.js';
import { SupabaseMemoryStore } from '../persistence/supabase/memory-store.js';

export interface MemoryServicesConfig {
  MEMORY_BACKEND: 'memory' | 'supabase';
  SUPABASE_DB_URL?: string;
  MEMORY_CANDIDATE_TTL_HOURS: number;
  DEMO_USER_SCOPE_ID: string;
}

export interface MemoryServices {
  userScopeId: string;
  candidateTtlMs: number;
  candidates: MemoryCandidateStore;
  durable: DurableMemoryStore;
}

export function createMemoryServices(config: MemoryServicesConfig): MemoryServices {
  if (config.MEMORY_BACKEND === 'supabase') {
    if (!config.SUPABASE_DB_URL) {
      throw new Error('SUPABASE_DB_URL is required when MEMORY_BACKEND is supabase');
    }
    const store = new SupabaseMemoryStore(createSupabaseSql(config.SUPABASE_DB_URL));
    return {
      userScopeId: config.DEMO_USER_SCOPE_ID,
      candidateTtlMs: config.MEMORY_CANDIDATE_TTL_HOURS * 60 * 60 * 1000,
      candidates: store,
      durable: store,
    };
  }

  const store = new InMemoryDurableMemoryStore();
  return {
    userScopeId: config.DEMO_USER_SCOPE_ID,
    candidateTtlMs: config.MEMORY_CANDIDATE_TTL_HOURS * 60 * 60 * 1000,
    candidates: store,
    durable: store,
  };
}
```

- [ ] **Step 4: Decorate Fastify**

Modify `apps/agent-api/src/types/fastify.d.ts`:

```ts
import type { MemoryServices } from '../runtime/memory-services.js';

declare module 'fastify' {
  interface FastifyInstance {
    memoryServices: MemoryServices;
  }
}
```

Modify `apps/agent-api/src/app.ts`:

```ts
import { createMemoryServices } from './runtime/memory-services.js';

const memoryServices = createMemoryServices(config);
app.decorate('memoryServices', memoryServices);
```

Place the decoration next to `runtime`, `config`, and `briefCache`.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @health-advisor/agent-api test -- memory-services.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/agent-api/src/runtime/memory-services.ts apps/agent-api/src/types/fastify.d.ts apps/agent-api/src/app.ts apps/agent-api/src/__tests__/runtime/memory-services.test.ts
git commit -m "feat(agent-api): wire memory services"
```

### Task 8: LLM Structured Memory Extraction

**Purpose:** Extract candidate memories from user chat messages without granting the extractor durable write access.

**Depends on:** Task 3.

**Files:**
- Create: `packages/agent-core/src/memory/memory-extraction-service.ts`
- Create: `packages/agent-core/src/__tests__/memory/memory-extraction-service.test.ts`
- Create: `data/sandbox/prompts/memory-extraction.md`
- Modify: `packages/agent-core/src/index.ts`

- [ ] **Step 1: Write extractor tests**

Create `packages/agent-core/src/__tests__/memory/memory-extraction-service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createHealthAgent } from '../../executor/create-agent';
import { FakeChatModel } from '../../provider/fake-chat-model';
import { LlmMemoryExtractionService } from '../../memory/memory-extraction-service';

describe('LlmMemoryExtractionService', () => {
  it('returns validated candidates from strict JSON output', async () => {
    const agent = createHealthAgent({ chatModel: new FakeChatModel(JSON.stringify({
      candidates: [
        {
          kind: 'allergy',
          canonicalKey: 'allergy:peanut',
          payload: { allergen: 'peanut', severity: 'unknown' },
          evidenceQuote: '我对花生过敏',
          source: 'user_declared',
          confidence: 'explicit',
          proposedConfirmationText: '是否记住：你对花生过敏？',
          requiresConfirmation: true,
        },
      ],
    })) });

    const service = new LlmMemoryExtractionService({
      agent,
      prompt: 'Extract memory candidates as JSON.',
    });

    const result = await service.extract({
      userMessage: '我对花生过敏',
      profileId: 'profile-a',
      sessionId: 'sess-1',
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.canonicalKey).toBe('allergy:peanut');
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `pnpm --filter @health-advisor/agent-core test -- memory-extraction-service.test.ts`

Expected: FAIL because service does not exist.

- [ ] **Step 3: Add extraction prompt**

Create `data/sandbox/prompts/memory-extraction.md`:

```md
You extract durable memory candidates from the latest user message.

Return JSON only:

{
  "candidates": [
    {
      "kind": "allergy | medical_constraint | goal | preference | workflow_contact | workflow_consent | correction | revocation",
      "canonicalKey": "stable namespace key such as allergy:peanut",
      "payload": {},
      "evidenceQuote": "exact substring from the user message",
      "source": "user_declared",
      "confidence": "explicit | ambiguous",
      "proposedConfirmationText": "Chinese user-facing confirmation question",
      "requiresConfirmation": true
    }
  ]
}

Rules:
- Extract only facts explicitly stated by the user.
- Do not infer durable facts from sensor data, assistant text, or health trends.
- Do not create a candidate without an exact evidenceQuote.
- All candidates require user confirmation.
- Return {"candidates":[]} when no supported candidate exists.
```

- [ ] **Step 4: Implement service**

Create `packages/agent-core/src/memory/memory-extraction-service.ts`:

```ts
import { z } from 'zod';
import type { HealthAgent } from '../executor/create-agent';
import type { ExtractedMemoryCandidate } from './memory-candidate-validator';
import { validateExtractedMemoryCandidate } from './memory-candidate-validator';

const ExtractionResponseSchema = z.object({
  candidates: z.array(z.object({
    kind: z.string(),
    canonicalKey: z.string(),
    payload: z.record(z.unknown()),
    evidenceQuote: z.string(),
    source: z.enum(['user_declared', 'model_inferred', 'sensor_inferred']),
    confidence: z.enum(['explicit', 'ambiguous']),
    proposedConfirmationText: z.string(),
    requiresConfirmation: z.boolean(),
  })),
});

export interface MemoryExtractionInput {
  userMessage: string;
  profileId: string;
  sessionId: string;
}

export interface MemoryExtractionResult {
  candidates: ExtractedMemoryCandidate[];
  rejectedCount: number;
}

export interface MemoryExtractionService {
  extract(input: MemoryExtractionInput): Promise<MemoryExtractionResult>;
}

export class LlmMemoryExtractionService implements MemoryExtractionService {
  constructor(private readonly deps: { agent: HealthAgent; prompt: string }) {}

  async extract(input: MemoryExtractionInput): Promise<MemoryExtractionResult> {
    const raw = await this.deps.agent.invoke({
      systemPrompt: this.deps.prompt,
      userPrompt: JSON.stringify({
        userMessage: input.userMessage,
        profileId: input.profileId,
        sessionId: input.sessionId,
      }),
    });

    const parsedJson = JSON.parse(raw.content) as unknown;
    const parsed = ExtractionResponseSchema.parse(parsedJson);
    const candidates: ExtractedMemoryCandidate[] = [];
    let rejectedCount = 0;

    for (const candidate of parsed.candidates) {
      const validation = validateExtractedMemoryCandidate(candidate);
      if (validation.valid) {
        candidates.push(candidate);
      } else {
        rejectedCount += 1;
      }
    }

    return { candidates, rejectedCount };
  }
}
```

- [ ] **Step 5: Export service**

Add to `packages/agent-core/src/index.ts`:

```ts
export { LlmMemoryExtractionService } from './memory/memory-extraction-service';
export type { MemoryExtractionInput, MemoryExtractionResult, MemoryExtractionService } from './memory/memory-extraction-service';
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @health-advisor/agent-core test -- memory-extraction-service.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/agent-core/src/memory/memory-extraction-service.ts packages/agent-core/src/__tests__/memory/memory-extraction-service.test.ts data/sandbox/prompts/memory-extraction.md packages/agent-core/src/index.ts
git commit -m "feat(agent-core): add memory extraction service"
```

### Task 9: Chat Candidate Extraction Integration

**Purpose:** Run extraction after advisor chat and return pending candidates with the assistant response.

**Depends on:** Task 1, Task 7, Task 8.

**Files:**
- Modify: `apps/agent-api/src/runtime/memory-services.ts`
- Modify: `apps/agent-api/src/modules/ai/routes.ts`
- Modify: `apps/agent-api/src/__tests__/modules/ai/routes.test.ts`

- [ ] **Step 1: Write route test**

Add a test to `apps/agent-api/src/__tests__/modules/ai/routes.test.ts`:

```ts
it('returns memory candidate confirmations for advisor chat', async () => {
  const app = await buildApp({
    env: {
      FALLBACK_ONLY_MODE: 'true',
      ENABLE_GOD_MODE: 'false',
      MEMORY_BACKEND: 'memory',
    },
  });

  app.memoryServices.extractor = {
    async extract() {
      return {
        candidates: [
          {
            kind: 'allergy',
            canonicalKey: 'allergy:peanut',
            payload: { allergen: 'peanut' },
            evidenceQuote: '我对花生过敏',
            source: 'user_declared',
            confidence: 'explicit',
            proposedConfirmationText: '是否记住：你对花生过敏？',
            requiresConfirmation: true,
          },
        ],
        rejectedCount: 0,
      };
    },
  };

  const response = await app.inject({
    method: 'POST',
    url: '/ai/chat',
    headers: { 'x-session-id': 'sess-1' },
    payload: {
      profileId: 'profile-a',
      pageContext: { profileId: 'profile-a', page: 'homepage', timeframe: 'week' },
      userMessage: '我对花生过敏',
    },
  });

  expect(response.statusCode).toBe(200);
  const body = response.json();
  expect(body.data.memoryCandidates).toHaveLength(1);
  expect(body.data.memoryCandidates[0].proposedConfirmationText).toContain('花生');

  await app.close();
});
```

- [ ] **Step 2: Run failing test**

Run: `pnpm --filter @health-advisor/agent-api test -- routes.test.ts`

Expected: FAIL because chat route does not call extractor.

- [ ] **Step 3: Extend memory services with extractor**

In `apps/agent-api/src/runtime/memory-services.ts`, add:

```ts
import type { MemoryExtractionService } from '@health-advisor/agent-core';

export interface MemoryServices {
  userScopeId: string;
  candidateTtlMs: number;
  candidates: MemoryCandidateStore;
  durable: DurableMemoryStore;
  extractor?: MemoryExtractionService;
}
```

- [ ] **Step 4: Wire real extractor in app startup**

In `apps/agent-api/src/app.ts`, after `const registry = createRuntimeRegistry(...)` and `const memoryServices = createMemoryServices(config)`, wire the real extractor:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LlmMemoryExtractionService } from '@health-advisor/agent-core';

const memoryServices = createMemoryServices(config);
if (config.MEMORY_EXTRACTION_ENABLED && !config.FALLBACK_ONLY_MODE) {
  memoryServices.extractor = new LlmMemoryExtractionService({
    agent: registry.agent,
    prompt: readFileSync(join(config.dataDir, 'prompts', 'memory-extraction.md'), 'utf-8'),
  });
}
app.decorate('memoryServices', memoryServices);
```

Keep this wiring in `app.ts` because `registry.agent` already holds the configured runtime agent and `agent-core` must not import Supabase or backend config. Route tests can assign `app.memoryServices.extractor` directly.

- [ ] **Step 5: Add chat route extraction**

In `apps/agent-api/src/modules/ai/routes.ts`, after `const result = await orchestrator.execute(...)`, add:

```ts
const memoryCandidates = [];

if (app.memoryServices.extractor && parseResult.data.userMessage) {
  const extraction = await app.memoryServices.extractor.extract({
    userMessage: parseResult.data.userMessage,
    profileId,
    sessionId: request.ctx.sessionId,
  });

  for (const extracted of extraction.candidates) {
    const now = Date.now();
    const candidate = await app.memoryServices.candidates.saveCandidate({
      id: crypto.randomUUID(),
      userScopeId: app.memoryServices.userScopeId,
      profileId,
      sessionId: request.ctx.sessionId,
      sourceMessageId: request.ctx.requestId,
      kind: extracted.kind,
      canonicalKey: extracted.canonicalKey,
      payload: extracted.payload,
      evidenceQuote: extracted.evidenceQuote,
      confidence: extracted.confidence,
      proposedConfirmationText: extracted.proposedConfirmationText,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      expiresAt: now + app.memoryServices.candidateTtlMs,
    });

    memoryCandidates.push({
      id: candidate.id,
      kind: candidate.kind,
      proposedConfirmationText: candidate.proposedConfirmationText,
      evidenceQuote: candidate.evidenceQuote,
    });
  }
}
```

Return:

```ts
return createSuccessResponse(
  attachSessionMeta({ ...result, ...(memoryCandidates.length > 0 ? { memoryCandidates } : {}) }, request.ctx.sessionId),
  buildMeta(request),
);
```

Import `crypto` from `node:crypto`.

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @health-advisor/agent-api test -- routes.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/agent-api/src/runtime/memory-services.ts apps/agent-api/src/app.ts apps/agent-api/src/modules/ai/routes.ts apps/agent-api/src/__tests__/modules/ai/routes.test.ts
git commit -m "feat(agent-api): return memory candidates from chat"
```

### Task 10: Memory Confirmation API

**Purpose:** Let the frontend confirm or reject candidate memory; only confirmation creates durable facts and revisions.

**Depends on:** Task 4, Task 6, Task 7.

**Files:**
- Create: `apps/agent-api/src/modules/memory/routes.ts`
- Modify: `apps/agent-api/src/app.ts`
- Create: `apps/agent-api/src/__tests__/modules/memory/routes.test.ts`
- Modify: `apps/agent-api/src/persistence/supabase/memory-store.ts`

- [ ] **Step 1: Write route tests**

Create `apps/agent-api/src/__tests__/modules/memory/routes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../../app';

describe('memory routes', () => {
  it('confirms a pending candidate into durable memory', async () => {
    const app = await buildApp({
      env: { FALLBACK_ONLY_MODE: 'true', ENABLE_GOD_MODE: 'false', MEMORY_BACKEND: 'memory' },
    });

    const now = Date.now();
    const saved = await app.memoryServices.candidates.saveCandidate({
      id: 'cand-1',
      userScopeId: 'demo',
      profileId: 'profile-a',
      sessionId: 'sess-1',
      sourceMessageId: 'msg-1',
      kind: 'allergy',
      canonicalKey: 'allergy:peanut',
      payload: { allergen: 'peanut' },
      evidenceQuote: '我对花生过敏',
      confidence: 'explicit',
      proposedConfirmationText: '是否记住：你对花生过敏？',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      expiresAt: now + 86_400_000,
    });

    const response = await app.inject({
      method: 'POST',
      url: `/memory/candidates/${saved.id}/confirm`,
      headers: { 'x-session-id': 'sess-1' },
      payload: { profileId: 'profile-a' },
    });

    expect(response.statusCode).toBe(200);
    const facts = await app.memoryServices.durable.listActiveFacts({
      userScopeId: 'demo',
      profileId: 'profile-a',
    });
    expect(facts).toHaveLength(1);

    await app.close();
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `pnpm --filter @health-advisor/agent-api test -- memory/routes.test.ts`

Expected: FAIL because routes do not exist.

- [ ] **Step 3: Add memory routes**

Create `apps/agent-api/src/modules/memory/routes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@health-advisor/shared';
import { buildMeta } from '../../utils/meta.js';

const CandidateActionBodySchema = z.object({
  profileId: z.string().min(1),
});

export async function memoryRoutes(app: FastifyInstance) {
  app.get('/memory/candidates', async (request, reply) => {
    const profileId = typeof request.query === 'object' && request.query && 'profileId' in request.query
      ? String((request.query as { profileId: string }).profileId)
      : '';
    if (!profileId) {
      return reply.status(400).send(createErrorResponse(ErrorCode.VALIDATION_ERROR, 'profileId is required', buildMeta(request)));
    }

    const candidates = await app.memoryServices.candidates.listPending({
      userScopeId: app.memoryServices.userScopeId,
      profileId,
      sessionId: request.ctx.sessionId,
      now: Date.now(),
    });

    return createSuccessResponse(candidates.map((candidate) => ({
      id: candidate.id,
      kind: candidate.kind,
      proposedConfirmationText: candidate.proposedConfirmationText,
      evidenceQuote: candidate.evidenceQuote,
    })), buildMeta(request));
  });

  app.post('/memory/candidates/:id/confirm', async (request, reply) => {
    const params = request.params as { id: string };
    const body = CandidateActionBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send(createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid memory confirmation body', buildMeta(request)));
    }

    const candidate = await app.memoryServices.candidates.getCandidate(params.id);
    if (!candidate || candidate.profileId !== body.data.profileId || candidate.sessionId !== request.ctx.sessionId) {
      return reply.status(404).send(createErrorResponse(ErrorCode.NOT_FOUND, 'Memory candidate not found', buildMeta(request)));
    }
    if (candidate.status !== 'pending' || candidate.expiresAt <= Date.now()) {
      return reply.status(409).send(createErrorResponse(ErrorCode.CONFLICT, 'Memory candidate is not pending', buildMeta(request)));
    }

    const result = await app.memoryServices.durable.confirmCandidate({ candidate, now: Date.now() });
    return createSuccessResponse(result.fact, buildMeta(request));
  });

  app.post('/memory/candidates/:id/reject', async (request, reply) => {
    const params = request.params as { id: string };
    const body = CandidateActionBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send(createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid memory rejection body', buildMeta(request)));
    }

    const candidate = await app.memoryServices.candidates.getCandidate(params.id);
    if (!candidate || candidate.profileId !== body.data.profileId || candidate.sessionId !== request.ctx.sessionId) {
      return reply.status(404).send(createErrorResponse(ErrorCode.NOT_FOUND, 'Memory candidate not found', buildMeta(request)));
    }

    const updated = await app.memoryServices.candidates.setCandidateStatus(params.id, 'rejected', Date.now());
    return createSuccessResponse(updated, buildMeta(request));
  });
}
```

- [ ] **Step 4: Register routes**

In `apps/agent-api/src/app.ts`:

```ts
import { memoryRoutes } from './modules/memory/routes.js';

await app.register(memoryRoutes);
```

Place it after `aiRoutes`.

- [ ] **Step 5: Add scope-protection test**

Add a second route test that creates a pending candidate under `sessionId: 'sess-1'`, then calls confirm with header `x-session-id: sess-2`.

Expected assertions:

```ts
expect(response.statusCode).toBe(404);
expect(await app.memoryServices.durable.listActiveFacts({
  userScopeId: 'demo',
  profileId: 'profile-a',
})).toHaveLength(0);
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @health-advisor/agent-api test -- memory/routes.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/agent-api/src/modules/memory/routes.ts apps/agent-api/src/app.ts apps/agent-api/src/__tests__/modules/memory/routes.test.ts
git commit -m "feat(agent-api): add memory confirmation routes"
```

### Task 11: Confirmed Durable Memory In Agent Context

**Purpose:** Inject only confirmed active facts into prompts; keep pending candidates and derived summaries out of durable memory context.

**Depends on:** Task 2, Task 4, Task 7, Task 10.

**Files:**
- Modify: `packages/agent-core/src/types/agent-context.ts`
- Create: `packages/agent-core/src/memory/durable-memory-context.ts`
- Modify: `packages/agent-core/src/context/context-builder.ts`
- Modify: `packages/agent-core/src/runtime/agent-runtime.ts`
- Modify: `packages/agent-core/src/prompts/task-builder.ts`
- Create: `packages/agent-core/src/__tests__/memory/durable-memory-context.test.ts`
- Modify: `packages/agent-core/src/__tests__/context/context-builder.test.ts`

- [ ] **Step 1: Write prompt rendering tests**

Create `packages/agent-core/src/__tests__/memory/durable-memory-context.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderDurableMemoryFacts } from '../../memory/durable-memory-context';
import type { UserMemoryFact } from '../../types/durable-memory';

const fact: UserMemoryFact = {
  id: 'fact-1',
  userScopeId: 'demo',
  profileId: 'profile-a',
  kind: 'allergy',
  canonicalKey: 'allergy:peanut',
  payload: { allergen: 'peanut', severity: 'unknown' },
  status: 'active',
  sensitivity: 'health',
  sourceCandidateId: 'cand-1',
  createdAt: 1760000000000,
  updatedAt: 1760000000000,
};

describe('renderDurableMemoryFacts', () => {
  it('renders confirmed facts as user-confirmed memory', () => {
    const lines = renderDurableMemoryFacts([fact], 'zh');
    expect(lines.join('\n')).toContain('用户已确认记忆');
    expect(lines.join('\n')).toContain('allergy:peanut');
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `pnpm --filter @health-advisor/agent-core test -- durable-memory-context.test.ts`

Expected: FAIL because renderer does not exist.

- [ ] **Step 3: Add context field**

In `packages/agent-core/src/types/agent-context.ts`, add:

```ts
import type { UserMemoryFact } from './durable-memory';
```

Then extend `memory`:

```ts
durableFacts: UserMemoryFact[];
```

- [ ] **Step 4: Add renderer**

Create `packages/agent-core/src/memory/durable-memory-context.ts`:

```ts
import type { Locale } from '@health-advisor/shared';
import type { UserMemoryFact } from '../types/durable-memory';

export function renderDurableMemoryFacts(facts: UserMemoryFact[], locale: Locale): string[] {
  if (facts.length === 0) return [];
  const heading = locale === 'zh' ? '用户已确认记忆' : 'User-confirmed memory';
  return [
    `## ${heading}`,
    ...facts.map((fact) => {
      const payload = JSON.stringify(fact.payload);
      return `- ${fact.kind}:${fact.canonicalKey} ${payload}`;
    }),
  ];
}
```

- [ ] **Step 5: Preload durable facts before context build**

In `packages/agent-core/src/runtime/agent-runtime.ts`, extend `AgentRuntimeDeps`:

```ts
durableMemory?: {
  listActiveFacts(input: { userScopeId: string; profileId: string }): Promise<UserMemoryFact[]>;
};
userScopeId?: string;
```

Before `buildAgentContext(...)`, add:

```ts
const durableFacts = deps.durableMemory
  ? await deps.durableMemory.listActiveFacts({
      userScopeId: deps.userScopeId ?? 'demo',
      profileId: request.profileId,
    })
  : [];

const context = buildAgentContext(request, deps, deps.referenceDate, locale, durableFacts);
```

Update `buildAgentContext` signature to accept `durableFacts: UserMemoryFact[] = []` and set `memory.durableFacts`.

- [ ] **Step 6: Render durable facts in task prompt**

In `packages/agent-core/src/prompts/task-builder.ts`, import and render:

```ts
import { renderDurableMemoryFacts } from '../memory/durable-memory-context';

const durableMemoryContext = renderDurableMemoryFacts(context.memory.durableFacts, locale);
if (durableMemoryContext.length > 0) {
  sections.push('');
  sections.push(...durableMemoryContext);
}
```

Place this before conversation history.

- [ ] **Step 7: Run focused tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- durable-memory-context.test.ts
pnpm --filter @health-advisor/agent-core test -- context-builder.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/agent-core/src/types/agent-context.ts packages/agent-core/src/memory/durable-memory-context.ts packages/agent-core/src/context/context-builder.ts packages/agent-core/src/runtime/agent-runtime.ts packages/agent-core/src/prompts/task-builder.ts packages/agent-core/src/__tests__/memory/durable-memory-context.test.ts packages/agent-core/src/__tests__/context/context-builder.test.ts
git commit -m "feat(agent-core): inject confirmed durable memory"
```

### Task 12: Derived Cache Boundary

**Purpose:** Keep homepage/view/planner outputs out of durable memory and label them as derived cache/artifacts.

**Depends on:** Task 11.

**Files:**
- Modify: `packages/agent-core/src/memory/analytical-memory-store.ts`
- Modify: `packages/agent-core/src/types/memory.ts`
- Modify: `packages/agent-core/src/prompts/task-builder.ts`
- Modify: `packages/agent-core/src/__tests__/memory/analytical-memory-store.test.ts`
- Modify: `packages/agent-core/src/__tests__/prompts/task-builder.test.ts`

- [ ] **Step 1: Add naming test for derived cache**

In `packages/agent-core/src/__tests__/prompts/task-builder.test.ts`, add a test that builds a prompt with `latestHomepageBrief` and expects `Derived Analysis Cache` or `派生分析缓存`, not `Historical Analysis Reference`.

```ts
expect(prompt).toContain('派生分析缓存');
expect(prompt).not.toContain('历史分析参考');
```

- [ ] **Step 2: Run failing test**

Run: `pnpm --filter @health-advisor/agent-core test -- task-builder.test.ts`

Expected: FAIL because the old heading is still used.

- [ ] **Step 3: Rename prompt section**

In `packages/agent-core/src/prompts/task-builder.ts`, change the analytical section heading:

```ts
sections.push(t(locale, '## 派生分析缓存', '## Derived Analysis Cache'));
```

Keep `buildAnalyticalContext` behavior unchanged. This task changes semantics and labels, not cache storage behavior.

- [ ] **Step 4: Add code comments for memory boundary**

In `packages/agent-core/src/memory/analytical-memory-store.ts`, update the interface comment:

```ts
/**
 * Stores derived per-session analysis cache.
 * This is not durable user memory and must not be used as a source of user facts.
 */
export interface AnalyticalMemoryStore {
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- analytical-memory-store.test.ts
pnpm --filter @health-advisor/agent-core test -- task-builder.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/memory/analytical-memory-store.ts packages/agent-core/src/types/memory.ts packages/agent-core/src/prompts/task-builder.ts packages/agent-core/src/__tests__/memory/analytical-memory-store.test.ts packages/agent-core/src/__tests__/prompts/task-builder.test.ts
git commit -m "refactor(agent-core): label analytical memory as derived cache"
```

### Task 13: Frontend Memory Confirmation Cards

**Purpose:** Let demo users confirm or reject candidate memory directly in the Advisor drawer.

**Depends on:** Task 1, Task 9, Task 10.

**Files:**
- Create: `apps/web/src/hooks/use-memory-query.ts`
- Create: `apps/web/src/components/advisor/MemoryCandidateCard.tsx`
- Modify: `apps/web/src/stores/ai-advisor.store.ts`
- Modify: `apps/web/src/components/advisor/MessageBubble.tsx`
- Modify: `apps/web/src/components/advisor/AIAdvisorDrawer.tsx`
- Create: `apps/web/src/components/advisor/MemoryCandidateCard.test.tsx`

- [ ] **Step 1: Extend message type**

In `apps/web/src/stores/ai-advisor.store.ts`, import `MemoryCandidateConfirmation` and extend `Message`:

```ts
import type { ChartTokenId, AgentResponseEnvelope, MemoryCandidateConfirmation } from '@health-advisor/shared';

memoryCandidates?: MemoryCandidateConfirmation[];
```

- [ ] **Step 2: Attach candidates to assistant messages**

In `apps/web/src/components/advisor/AIAdvisorDrawer.tsx`, add `memoryCandidates` when adding assistant message:

```ts
addMessage({
  role: 'assistant',
  content: response.summary,
  chartTokens: response.chartTokens,
  microTips: response.microTips,
  source: response.source,
  statusColor: response.statusColor,
  meta: response.meta,
  memoryCandidates: response.memoryCandidates,
});
```

- [ ] **Step 3: Add memory mutation hook**

Create `apps/web/src/hooks/use-memory-query.ts`:

```ts
'use client';

import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export function useConfirmMemoryCandidate(profileId: string | undefined) {
  return useMutation({
    mutationFn: async (candidateId: string) => {
      if (!profileId) throw new Error('profileId is required');
      return apiClient.post(`/memory/candidates/${candidateId}/confirm`, { profileId });
    },
  });
}

export function useRejectMemoryCandidate(profileId: string | undefined) {
  return useMutation({
    mutationFn: async (candidateId: string) => {
      if (!profileId) throw new Error('profileId is required');
      return apiClient.post(`/memory/candidates/${candidateId}/reject`, { profileId });
    },
  });
}
```

- [ ] **Step 4: Add confirmation card**

Create `apps/web/src/components/advisor/MemoryCandidateCard.tsx`:

```tsx
'use client';

import type { MemoryCandidateConfirmation } from '@health-advisor/shared';
import { useProfileStore } from '@/stores/profile.store';
import { useConfirmMemoryCandidate, useRejectMemoryCandidate } from '@/hooks/use-memory-query';

interface MemoryCandidateCardProps {
  candidate: MemoryCandidateConfirmation;
}

export function MemoryCandidateCard({ candidate }: MemoryCandidateCardProps) {
  const { currentProfileId } = useProfileStore();
  const confirm = useConfirmMemoryCandidate(currentProfileId);
  const reject = useRejectMemoryCandidate(currentProfileId);

  const disabled = confirm.isPending || reject.isPending || confirm.isSuccess || reject.isSuccess;
  const status = confirm.isSuccess ? '已记住' : reject.isSuccess ? '已忽略' : null;

  return (
    <div className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200">
      <p className="font-medium">{candidate.proposedConfirmationText}</p>
      <p className="mt-1 text-slate-500">来源：{candidate.evidenceQuote}</p>
      {status ? (
        <p className="mt-2 text-emerald-400">{status}</p>
      ) : (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => confirm.mutate(candidate.id)}
            className="rounded bg-blue-600 px-3 py-1 font-medium text-white disabled:opacity-50"
          >
            记住
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => reject.mutate(candidate.id)}
            className="rounded bg-slate-800 px-3 py-1 font-medium text-slate-300 disabled:opacity-50"
          >
            忽略
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Render cards under assistant message**

In `apps/web/src/components/advisor/MessageBubble.tsx`, import and render:

```tsx
import { MemoryCandidateCard } from './MemoryCandidateCard';

{isAssistant && message.memoryCandidates && message.memoryCandidates.length > 0 && (
  <div className="mt-2 flex w-full flex-col gap-2">
    {message.memoryCandidates.map((candidate) => (
      <MemoryCandidateCard key={candidate.id} candidate={candidate} />
    ))}
  </div>
)}
```

- [ ] **Step 6: Run frontend tests**

Run: `pnpm --filter web test`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/hooks/use-memory-query.ts apps/web/src/components/advisor/MemoryCandidateCard.tsx apps/web/src/stores/ai-advisor.store.ts apps/web/src/components/advisor/MessageBubble.tsx apps/web/src/components/advisor/AIAdvisorDrawer.tsx
git commit -m "feat(web): add memory confirmation cards"
```

### Task 14: Demo Workflow Outbox Reservation

**Purpose:** Reserve the workflow path in code and demo a mock therapist outreach action without real email delivery.

**Depends on:** Task 5, Task 7, Task 10.

**Files:**
- Create: `packages/agent-core/src/types/workflow-memory.ts`
- Create: `apps/agent-api/src/modules/workflows/routes.ts`
- Create: `apps/agent-api/src/__tests__/modules/workflows/routes.test.ts`
- Modify: `apps/agent-api/src/app.ts`

- [ ] **Step 1: Write workflow route test**

Create `apps/agent-api/src/__tests__/modules/workflows/routes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../../app';

describe('workflow demo routes', () => {
  it('creates a mock outbox action instead of sending email', async () => {
    const app = await buildApp({
      env: { FALLBACK_ONLY_MODE: 'true', ENABLE_GOD_MODE: 'false', MEMORY_BACKEND: 'memory' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/workflows/therapist-outreach/propose',
      headers: { 'x-session-id': 'sess-1' },
      payload: {
        profileId: 'profile-a',
        reason: '用户确认疲劳并授权联系理疗师',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe('pending');

    await app.close();
  });
});
```

- [ ] **Step 2: Define workflow API type**

Create `packages/agent-core/src/types/workflow-memory.ts`:

```ts
export interface WorkflowOutboxItem {
  id: string;
  userScopeId: string;
  profileId: string;
  workflowType: string;
  contactId?: string;
  consentId?: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'sent' | 'cancelled' | 'failed';
  createdAt: number;
  updatedAt: number;
  processedAt?: number;
}
```

- [ ] **Step 3: Add demo route**

Create `apps/agent-api/src/modules/workflows/routes.ts`:

```ts
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@health-advisor/shared';
import { buildMeta } from '../../utils/meta.js';

const ProposeTherapistOutreachSchema = z.object({
  profileId: z.string().min(1),
  reason: z.string().min(1),
});

export async function workflowRoutes(app: FastifyInstance) {
  app.post('/workflows/therapist-outreach/propose', async (request, reply) => {
    const body = ProposeTherapistOutreachSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send(createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid workflow proposal body', buildMeta(request)));
    }

    const outboxItem = {
      id: crypto.randomUUID(),
      userScopeId: app.memoryServices.userScopeId,
      profileId: body.data.profileId,
      workflowType: 'therapist_outreach',
      payload: {
        reason: body.data.reason,
        deliveryMode: 'mock',
      },
      status: 'pending' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    return createSuccessResponse(outboxItem, buildMeta(request));
  });
}
```

- [ ] **Step 4: Register route**

In `apps/agent-api/src/app.ts`:

```ts
import { workflowRoutes } from './modules/workflows/routes.js';

await app.register(workflowRoutes);
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @health-advisor/agent-api test -- workflows/routes.test.ts`

Expected: PASS and no real external side effect.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/types/workflow-memory.ts apps/agent-api/src/modules/workflows/routes.ts apps/agent-api/src/__tests__/modules/workflows/routes.test.ts apps/agent-api/src/app.ts
git commit -m "feat(agent-api): add mock workflow outbox route"
```

### Task 15: End-To-End Demo Verification

**Purpose:** Verify the full demo loop works with the in-memory backend before testing Supabase credentials.

**Depends on:** Tasks 1-14.

**Files:**
- Modify: `docs/ops/local-development.md`
- Create: `docs/test/memory-upgrade-demo-runbook.md`

- [ ] **Step 1: Add demo runbook**

Create `docs/test/memory-upgrade-demo-runbook.md`:

```md
# Memory Upgrade Demo Runbook

## Local in-memory demo

1. Start API with `MEMORY_BACKEND=memory`, `FALLBACK_ONLY_MODE=false`, a valid LLM key, and `MEMORY_EXTRACTION_ENABLED=true`.
2. Start web app.
3. Open Advisor chat.
4. Send: `我对花生过敏`.
5. Confirm the memory candidate card.
6. Send: `我今天适合吃花生酱补充能量吗？`
7. Expected: answer acknowledges the confirmed peanut allergy and avoids treating peanut butter as suitable.

## Supabase demo

1. Apply `supabase/migrations/202605180001_memory_upgrade.sql` to the Supabase project.
2. Set `MEMORY_BACKEND=supabase`.
3. Set `SUPABASE_DB_URL` to the backend Postgres connection string.
4. Repeat the local demo.
5. Restart the API.
6. Repeat step 6.
7. Expected: confirmed allergy still influences the answer after restart.

## Workflow mock

1. Confirm a therapist contact and consent candidate when the extractor returns one.
2. Call `POST /workflows/therapist-outreach/propose`.
3. Expected: backend returns a pending mock outbox item.
4. Expected: no real email is sent.
```

- [ ] **Step 2: Add local dev note**

In `docs/ops/local-development.md`, add a short section:

```md
## Memory Upgrade Demo

Use `MEMORY_BACKEND=memory` for local development. Use `MEMORY_BACKEND=supabase` with `SUPABASE_DB_URL` only when testing Supabase persistence. The demo does not require Supabase Auth, Storage, Realtime, or Edge Functions.
```

- [ ] **Step 3: Run full package tests**

Run:

```bash
pnpm --filter @health-advisor/shared test
pnpm --filter @health-advisor/agent-core test
pnpm --filter @health-advisor/agent-api test
pnpm --filter web test
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add docs/test/memory-upgrade-demo-runbook.md docs/ops/local-development.md
git commit -m "docs: add memory upgrade demo runbook"
```

## Execution Order And Dependency Graph

Run tasks in this order:

```text
Task 1
  -> Task 2
    -> Task 3
    -> Task 4
      -> Task 5
        -> Task 6
          -> Task 7
            -> Task 8
              -> Task 9
                -> Task 10
                  -> Task 11
                    -> Task 12
                    -> Task 13
                    -> Task 14
                      -> Task 15
```

The only parallel-safe split is:

- After Task 10, Task 11 and Task 13 can be implemented by different engineers if they coordinate on the shared `memoryCandidates` response type.
- Task 14 can run after Task 7 because it only depends on memory services and app route wiring.

## Self-Review

### Spec Coverage

| Design requirement | Plan coverage |
|---|---|
| Supabase Free project as first backend | Task 5, Task 6, Task 7 |
| Backend-owned DB access, no Supabase Auth requirement | Task 5, Task 7, Task 15 |
| Durable memory only for confirmed user facts | Task 2, Task 3, Task 4, Task 10, Task 11 |
| Extractor creates candidates only | Task 8, Task 9 |
| User confirmation required before durable write | Task 10, Task 13 |
| Homepage/view/planner outputs are cache/artifacts, not durable memory | Task 12 |
| Workflow outbox reservation, no real email | Task 14, Task 15 |
| Narrow taxonomy | Task 1, Task 2, Task 3, Task 8 |
| Profile isolation | Task 4, Task 10, Task 11 |
| Demo path works before formal productionization | Task 13, Task 14, Task 15 |

No design requirement is intentionally omitted.

### Reasonableness Review

The plan builds the memory system from contracts outward. It avoids binding `agent-core` to Supabase, keeps extraction separate from persistence, and provides an in-memory path for fast tests and demo development. Supabase work is isolated to `apps/agent-api/src/persistence/supabase`, so a future backend swap does not require rewriting Agent memory semantics.

The biggest implementation risk is async durable memory loading before `buildAgentContext()`, covered in Task 11. The plan addresses this by preloading facts in `executeAgent()` and passing them into the synchronous context builder. This keeps database access outside prompt rendering and avoids making every context helper async.

The second risk is changing `AgentResponseEnvelope` because it is shared by homepage, view summary, and advisor chat. The field is optional, so existing callers do not need to change unless they want to display candidate cards. Task 1 includes schema coverage for backward compatibility.

The workflow section is intentionally small. It reserves the outbox shape and demo route while keeping real delivery and production Auth outside the current build, matching the revised design.

### Design Difference Review

The implementation plan does not change the design. It adds concrete file names, environment variable names, route paths, test paths, and task order. Those are implementation details derived from the design:

- `MEMORY_BACKEND`, `SUPABASE_DB_URL`, `MEMORY_EXTRACTION_ENABLED`, `MEMORY_CANDIDATE_TTL_HOURS`, and `DEMO_USER_SCOPE_ID` operationalize the Supabase/backend-owned storage decision.
- `/memory/candidates/:id/confirm` and `/memory/candidates/:id/reject` operationalize user confirmation.
- `/workflows/therapist-outreach/propose` operationalizes mock workflow outbox without real email delivery.

There is no planned durable storage of homepage summaries, view summaries, planner outputs, reflection reports, tool traces, raw prompts, or model outputs.

### Placeholder Scan

No `TODO`, `TBD`, or unspecified implementation task remains in this plan. Every task has exact file paths, dependency notes, verification commands, and a commit message.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-18-memory-upgrade-implementation-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
