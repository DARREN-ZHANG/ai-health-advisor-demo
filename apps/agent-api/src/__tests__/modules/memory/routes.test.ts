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

  it('rejects cross-session candidate confirmation', async () => {
    const app = await buildApp({
      env: { FALLBACK_ONLY_MODE: 'true', ENABLE_GOD_MODE: 'false', MEMORY_BACKEND: 'memory' },
    });

    const now = Date.now();
    await app.memoryServices.candidates.saveCandidate({
      id: 'cand-2',
      userScopeId: 'demo',
      profileId: 'profile-a',
      sessionId: 'sess-1',
      sourceMessageId: 'msg-1',
      kind: 'allergy',
      canonicalKey: 'allergy:shellfish',
      payload: { allergen: 'shellfish' },
      evidenceQuote: '我对贝类过敏',
      confidence: 'explicit',
      proposedConfirmationText: '是否记住：你对贝类过敏？',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      expiresAt: now + 86_400_000,
    });

    const response = await app.inject({
      method: 'POST',
      url: `/memory/candidates/cand-2/confirm`,
      headers: { 'x-session-id': 'sess-2' },
      payload: { profileId: 'profile-a' },
    });

    expect(response.statusCode).toBe(404);
    expect(await app.memoryServices.durable.listActiveFacts({
      userScopeId: 'demo',
      profileId: 'profile-a',
    })).toHaveLength(0);

    await app.close();
  });
});
