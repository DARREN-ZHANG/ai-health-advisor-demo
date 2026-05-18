export type WorkflowContactType = 'therapist' | 'coach' | 'doctor' | 'caregiver' | 'other';
export type WorkflowRecordStatus = 'active' | 'inactive';
export type WorkflowConsentStatus = 'active' | 'revoked';
export type WorkflowOutboxStatus = 'pending' | 'processing' | 'sent' | 'cancelled' | 'failed';

export interface WorkflowContact {
  id: string;
  userScopeId: string;
  profileId: string;
  contactType: WorkflowContactType;
  displayName: string;
  email?: string;
  phone?: string;
  metadata: Record<string, unknown>;
  status: WorkflowRecordStatus;
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowConsent {
  id: string;
  userScopeId: string;
  profileId: string;
  workflowType: string;
  contactId?: string;
  scope: Record<string, unknown>;
  status: WorkflowConsentStatus;
  createdAt: number;
  updatedAt: number;
  revokedAt?: number;
}

export interface WorkflowOutboxItem {
  id: string;
  userScopeId: string;
  profileId: string;
  workflowType: string;
  contactId?: string;
  consentId?: string;
  payload: Record<string, unknown>;
  status: WorkflowOutboxStatus;
  createdAt: number;
  updatedAt: number;
  processedAt?: number;
}

export interface WorkflowEvent {
  id: string;
  workflowOutboxId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

export interface WorkflowStateStore {
  upsertContact(contact: WorkflowContact): Promise<WorkflowContact>;
  upsertConsent(consent: WorkflowConsent): Promise<WorkflowConsent>;
  findActiveConsent(input: { userScopeId: string; profileId: string; workflowType: string; contactId?: string }): Promise<WorkflowConsent | undefined>;
  enqueueOutbox(item: WorkflowOutboxItem): Promise<WorkflowOutboxItem>;
  appendEvent(event: WorkflowEvent): Promise<WorkflowEvent>;
  listEvents(workflowOutboxId: string): Promise<WorkflowEvent[]>;
}
