import { describe, expect, it } from 'vitest';
import { SupabaseMemoryStore } from '../../../persistence/supabase/memory-store';
import type { MemoryCandidateRecord } from '@health-advisor/agent-core';

class FakeSql {
  responses: unknown[][] = [];
  queries: string[] = [];

  async query<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> {
    this.queries.push(strings.join('?'));
    void values;
    return (this.responses.shift() ?? []) as T[];
  }
}

function candidate(overrides: Partial<MemoryCandidateRecord> = {}): MemoryCandidateRecord {
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
    ...overrides,
  };
}

function candidateRow(overrides: Record<string, unknown> = {}) {
  const record = candidate();
  return {
    id: record.id,
    user_scope_id: record.userScopeId,
    profile_id: record.profileId,
    session_id: record.sessionId,
    source_message_id: record.sourceMessageId,
    kind: record.kind,
    canonical_key: record.canonicalKey,
    payload_json: record.payload,
    evidence_quote: record.evidenceQuote,
    confidence: record.confidence,
    proposed_confirmation_text: record.proposedConfirmationText,
    status: record.status,
    created_at: new Date(record.createdAt).toISOString(),
    updated_at: new Date(record.updatedAt).toISOString(),
    expires_at: new Date(record.expiresAt).toISOString(),
    ...overrides,
  };
}

function factRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fact-1',
    user_scope_id: 'demo',
    profile_id: 'profile-a',
    kind: 'allergy',
    canonical_key: 'allergy:peanut',
    payload_json: { allergen: 'peanut' },
    status: 'active',
    sensitivity: 'health',
    source_candidate_id: 'cand-1',
    created_at: new Date(1760000000000).toISOString(),
    updated_at: new Date(1760000000000).toISOString(),
    revoked_at: null,
    ...overrides,
  };
}

function revisionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rev-1',
    memory_fact_id: 'fact-1',
    revision_type: 'create',
    previous_payload_json: null,
    next_payload_json: { allergen: 'peanut' },
    source_candidate_id: 'cand-1',
    created_at: new Date(1760000000000).toISOString(),
    ...overrides,
  };
}

describe('SupabaseMemoryStore', () => {
  it('saves candidates through memory_candidates table', async () => {
    const sql = new FakeSql();
    sql.responses = [[candidateRow()]];
    const store = new SupabaseMemoryStore(sql);

    const saved = await store.saveCandidate(candidate());

    expect(saved.id).toBe('cand-1');
    expect(sql.queries[0]).toContain('insert into memory_candidates');
  });

  it('updates an existing active fact for the same canonical key', async () => {
    const sql = new FakeSql();
    sql.responses = [
      [factRow({ payload_json: { allergen: 'peanut', severity: 'unknown' } })],
      [factRow({
        payload_json: { allergen: 'peanut', severity: 'severe' },
        source_candidate_id: 'cand-2',
        updated_at: new Date(1760000002000).toISOString(),
      })],
      [revisionRow({
        revision_type: 'update',
        previous_payload_json: { allergen: 'peanut', severity: 'unknown' },
        next_payload_json: { allergen: 'peanut', severity: 'severe' },
        source_candidate_id: 'cand-2',
      })],
      [candidateRow({ id: 'cand-2', status: 'confirmed' })],
    ];
    const store = new SupabaseMemoryStore(sql);

    const result = await store.confirmCandidate({
      candidate: candidate({
        id: 'cand-2',
        payload: { allergen: 'peanut', severity: 'severe' },
      }),
      now: 1760000002000,
    });

    expect(result.revision.revisionType).toBe('update');
    expect(result.revision.previousPayload).toEqual({ allergen: 'peanut', severity: 'unknown' });
    expect(sql.queries.some((query) => query.includes('update user_memory_facts'))).toBe(true);
  });
});
