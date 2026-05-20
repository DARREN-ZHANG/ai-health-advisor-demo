import type {
  WorkflowConsent,
  WorkflowContact,
  WorkflowEvent,
  WorkflowOutboxItem,
  WorkflowStateStore,
} from '../types/workflow-memory';

export class InMemoryWorkflowStateStore implements WorkflowStateStore {
  private contacts = new Map<string, WorkflowContact>();
  private consents = new Map<string, WorkflowConsent>();
  private outbox = new Map<string, WorkflowOutboxItem>();
  private events = new Map<string, WorkflowEvent[]>();

  async upsertContact(contact: WorkflowContact): Promise<WorkflowContact> {
    this.contacts.set(contact.id, contact);
    return contact;
  }

  async upsertConsent(consent: WorkflowConsent): Promise<WorkflowConsent> {
    this.consents.set(consent.id, consent);
    return consent;
  }

  async findActiveConsent(input: { userScopeId: string; profileId: string; workflowType: string; contactId?: string }): Promise<WorkflowConsent | undefined> {
    return Array.from(this.consents.values()).find((consent) => {
      return consent.userScopeId === input.userScopeId
        && consent.profileId === input.profileId
        && consent.workflowType === input.workflowType
        && consent.status === 'active'
        && (!input.contactId || consent.contactId === input.contactId);
    });
  }

  async enqueueOutbox(item: WorkflowOutboxItem): Promise<WorkflowOutboxItem> {
    this.outbox.set(item.id, item);
    return item;
  }

  async appendEvent(event: WorkflowEvent): Promise<WorkflowEvent> {
    const existing = this.events.get(event.workflowOutboxId) ?? [];
    this.events.set(event.workflowOutboxId, [...existing, event]);
    return event;
  }

  async listEvents(workflowOutboxId: string): Promise<WorkflowEvent[]> {
    return this.events.get(workflowOutboxId) ?? [];
  }
}
