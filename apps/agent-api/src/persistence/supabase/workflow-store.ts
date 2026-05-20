import type {
  WorkflowConsent,
  WorkflowContact,
  WorkflowEvent,
  WorkflowOutboxItem,
  WorkflowStateStore,
} from '@health-advisor/agent-core';
import type { SqlExecutor } from './client.js';

function fromOutboxRow(row: Record<string, unknown>): WorkflowOutboxItem {
  return {
    id: String(row.id),
    userScopeId: String(row.user_scope_id),
    profileId: String(row.profile_id),
    workflowType: String(row.workflow_type),
    contactId: row.contact_id ? String(row.contact_id) : undefined,
    consentId: row.consent_id ? String(row.consent_id) : undefined,
    payload: row.payload_json as Record<string, unknown>,
    status: row.status as WorkflowOutboxItem['status'],
    createdAt: new Date(String(row.created_at)).getTime(),
    updatedAt: new Date(String(row.updated_at)).getTime(),
    processedAt: row.processed_at ? new Date(String(row.processed_at)).getTime() : undefined,
  };
}

function fromEventRow(row: Record<string, unknown>): WorkflowEvent {
  return {
    id: String(row.id),
    workflowOutboxId: String(row.workflow_outbox_id),
    eventType: String(row.event_type),
    payload: row.payload_json as Record<string, unknown>,
    createdAt: new Date(String(row.created_at)).getTime(),
  };
}

export class SupabaseWorkflowStateStore implements WorkflowStateStore {
  constructor(private readonly sql: SqlExecutor) {}

  async upsertContact(contact: WorkflowContact): Promise<WorkflowContact> {
    const rows = await this.sql.query<Record<string, unknown>>`
      insert into workflow_contacts (
        id, user_scope_id, profile_id, contact_type, display_name, email, phone,
        metadata_json, status, created_at, updated_at
      )
      values (
        ${contact.id}, ${contact.userScopeId}, ${contact.profileId}, ${contact.contactType},
        ${contact.displayName}, ${contact.email ?? null}, ${contact.phone ?? null},
        ${contact.metadata}, ${contact.status}, ${new Date(contact.createdAt)}, ${new Date(contact.updatedAt)}
      )
      on conflict (id) do update set
        display_name = excluded.display_name,
        email = excluded.email,
        phone = excluded.phone,
        metadata_json = excluded.metadata_json,
        status = excluded.status,
        updated_at = excluded.updated_at
      returning *
    `;
    const row = rows[0]!;
    return {
      id: String(row.id),
      userScopeId: String(row.user_scope_id),
      profileId: String(row.profile_id),
      contactType: row.contact_type as WorkflowContact['contactType'],
      displayName: String(row.display_name),
      email: row.email ? String(row.email) : undefined,
      phone: row.phone ? String(row.phone) : undefined,
      metadata: row.metadata_json as Record<string, unknown>,
      status: row.status as WorkflowContact['status'],
      createdAt: new Date(String(row.created_at)).getTime(),
      updatedAt: new Date(String(row.updated_at)).getTime(),
    };
  }

  async upsertConsent(consent: WorkflowConsent): Promise<WorkflowConsent> {
    const rows = await this.sql.query<Record<string, unknown>>`
      insert into workflow_consents (
        id, user_scope_id, profile_id, workflow_type, contact_id, scope_json,
        status, created_at, updated_at, revoked_at
      )
      values (
        ${consent.id}, ${consent.userScopeId}, ${consent.profileId}, ${consent.workflowType},
        ${consent.contactId ?? null}, ${consent.scope}, ${consent.status},
        ${new Date(consent.createdAt)}, ${new Date(consent.updatedAt)},
        ${consent.revokedAt ? new Date(consent.revokedAt) : null}
      )
      on conflict (id) do update set
        scope_json = excluded.scope_json,
        status = excluded.status,
        updated_at = excluded.updated_at,
        revoked_at = excluded.revoked_at
      returning *
    `;
    const row = rows[0]!;
    return {
      id: String(row.id),
      userScopeId: String(row.user_scope_id),
      profileId: String(row.profile_id),
      workflowType: String(row.workflow_type),
      contactId: row.contact_id ? String(row.contact_id) : undefined,
      scope: row.scope_json as Record<string, unknown>,
      status: row.status as WorkflowConsent['status'],
      createdAt: new Date(String(row.created_at)).getTime(),
      updatedAt: new Date(String(row.updated_at)).getTime(),
      revokedAt: row.revoked_at ? new Date(String(row.revoked_at)).getTime() : undefined,
    };
  }

  async findActiveConsent(input: { userScopeId: string; profileId: string; workflowType: string; contactId?: string }): Promise<WorkflowConsent | undefined> {
    const rows = input.contactId
      ? await this.sql.query<Record<string, unknown>>`
          select * from workflow_consents
          where user_scope_id = ${input.userScopeId}
            and profile_id = ${input.profileId}
            and workflow_type = ${input.workflowType}
            and contact_id = ${input.contactId}
            and status = 'active'
          limit 1
        `
      : await this.sql.query<Record<string, unknown>>`
          select * from workflow_consents
          where user_scope_id = ${input.userScopeId}
            and profile_id = ${input.profileId}
            and workflow_type = ${input.workflowType}
            and status = 'active'
          limit 1
        `;
    if (!rows[0]) return undefined;
    return {
      id: String(rows[0].id),
      userScopeId: String(rows[0].user_scope_id),
      profileId: String(rows[0].profile_id),
      workflowType: String(rows[0].workflow_type),
      contactId: rows[0].contact_id ? String(rows[0].contact_id) : undefined,
      scope: rows[0].scope_json as Record<string, unknown>,
      status: rows[0].status as WorkflowConsent['status'],
      createdAt: new Date(String(rows[0].created_at)).getTime(),
      updatedAt: new Date(String(rows[0].updated_at)).getTime(),
      revokedAt: rows[0].revoked_at ? new Date(String(rows[0].revoked_at)).getTime() : undefined,
    };
  }

  async enqueueOutbox(item: WorkflowOutboxItem): Promise<WorkflowOutboxItem> {
    const rows = await this.sql.query<Record<string, unknown>>`
      insert into workflow_outbox (
        id, user_scope_id, profile_id, workflow_type, contact_id, consent_id,
        payload_json, status, created_at, updated_at, processed_at
      )
      values (
        ${item.id}, ${item.userScopeId}, ${item.profileId}, ${item.workflowType},
        ${item.contactId ?? null}, ${item.consentId ?? null}, ${item.payload}, ${item.status},
        ${new Date(item.createdAt)}, ${new Date(item.updatedAt)},
        ${item.processedAt ? new Date(item.processedAt) : null}
      )
      returning *
    `;
    return fromOutboxRow(rows[0]!);
  }

  async appendEvent(event: WorkflowEvent): Promise<WorkflowEvent> {
    const rows = await this.sql.query<Record<string, unknown>>`
      insert into workflow_events (id, workflow_outbox_id, event_type, payload_json, created_at)
      values (${event.id}, ${event.workflowOutboxId}, ${event.eventType}, ${event.payload}, ${new Date(event.createdAt)})
      returning *
    `;
    return fromEventRow(rows[0]!);
  }

  async listEvents(workflowOutboxId: string): Promise<WorkflowEvent[]> {
    const rows = await this.sql.query<Record<string, unknown>>`
      select * from workflow_events
      where workflow_outbox_id = ${workflowOutboxId}
      order by created_at asc
    `;
    return rows.map(fromEventRow);
  }
}
