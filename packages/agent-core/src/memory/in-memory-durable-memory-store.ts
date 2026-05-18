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
    const revisionId = `rev-${input.candidate.id}`;
    const existing = Array.from(this.facts.values()).find((fact) => {
      return fact.userScopeId === input.candidate.userScopeId
        && fact.profileId === input.candidate.profileId
        && fact.canonicalKey === input.candidate.canonicalKey
        && fact.status === 'active';
    });

    if (existing) {
      const updated: UserMemoryFact = {
        ...existing,
        kind: input.candidate.kind,
        payload: input.candidate.payload,
        sensitivity: input.candidate.kind === 'allergy' || input.candidate.kind === 'medical_constraint'
          ? 'health'
          : input.candidate.kind.startsWith('workflow_')
            ? 'workflow'
            : 'standard',
        sourceCandidateId: input.candidate.id,
        updatedAt: input.now,
      };
      const revision: MemoryRevision = {
        id: revisionId,
        memoryFactId: existing.id,
        revisionType: 'update',
        previousPayload: existing.payload,
        nextPayload: updated.payload,
        sourceCandidateId: input.candidate.id,
        createdAt: input.now,
      };
      this.facts.set(existing.id, updated);
      this.revisions.set(revision.id, revision);
      await this.setCandidateStatus(input.candidate.id, 'confirmed', input.now);
      return { fact: updated, revision };
    }

    const factId = `fact-${input.candidate.id}`;
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

  seedFact(fact: UserMemoryFact): void {
    this.facts.set(fact.id, fact);
  }
}
