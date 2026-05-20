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

  it('updates the existing active fact when canonical key already exists', async () => {
    const store = new InMemoryDurableMemoryStore();
    const first = await store.saveCandidate(candidate());
    await store.confirmCandidate({ candidate: first, now: 1760000001000 });
    const second = await store.saveCandidate(candidate({
      id: 'cand-2',
      payload: { allergen: 'peanut', severity: 'severe' },
      evidenceQuote: '我对花生严重过敏',
    }));

    const result = await store.confirmCandidate({ candidate: second, now: 1760000002000 });
    const facts = await store.listActiveFacts({ userScopeId: 'demo', profileId: 'profile-a' });

    expect(result.revision.revisionType).toBe('update');
    expect(result.revision.previousPayload).toEqual({ allergen: 'peanut', severity: 'unknown' });
    expect(result.revision.nextPayload).toEqual({ allergen: 'peanut', severity: 'severe' });
    expect(facts).toHaveLength(1);
    expect(facts[0]?.payload).toEqual({ allergen: 'peanut', severity: 'severe' });
  });
});
