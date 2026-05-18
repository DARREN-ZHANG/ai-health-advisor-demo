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
