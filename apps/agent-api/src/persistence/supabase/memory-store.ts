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
    const existingRows = await this.sql.query<Record<string, unknown>>`
      select * from user_memory_facts
      where user_scope_id = ${input.candidate.userScopeId}
        and profile_id = ${input.candidate.profileId}
        and canonical_key = ${input.candidate.canonicalKey}
        and status = 'active'
      limit 1
    `;
    const existing = existingRows[0] ? fromFactRow(existingRows[0]) : undefined;

    const factRows = existing
      ? await this.sql.query<Record<string, unknown>>`
          update user_memory_facts
          set kind = ${input.candidate.kind},
              payload_json = ${input.candidate.payload},
              sensitivity = ${sensitivityForKind(input.candidate.kind)},
              source_candidate_id = ${input.candidate.id},
              updated_at = ${new Date(input.now)}
          where id = ${existing.id}
          returning *
        `
      : await this.sql.query<Record<string, unknown>>`
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
          returning *
        `;
    const fact = fromFactRow(factRows[0]!);
    const revisionType: MemoryRevision['revisionType'] = existing ? 'update' : 'create';

    const revisionRows = await this.sql.query<Record<string, unknown>>`
      insert into memory_revisions (
        memory_fact_id, revision_type, previous_payload_json, next_payload_json,
        source_candidate_id, created_at
      )
      values (
        ${fact.id}, ${revisionType}, ${existing?.payload ?? null}, ${fact.payload},
        ${input.candidate.id}, ${new Date(input.now)}
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
