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
