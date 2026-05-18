import { describe, expect, it } from 'vitest';
import { SupabaseWorkflowStateStore } from '../../../persistence/supabase/workflow-store';

class FakeSql {
  responses: unknown[][] = [];
  queries: string[] = [];

  async query<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> {
    this.queries.push(strings.join('?'));
    void values;
    return (this.responses.shift() ?? []) as T[];
  }
}

describe('SupabaseWorkflowStateStore', () => {
  it('enqueues outbox rows and appends events', async () => {
    const sql = new FakeSql();
    sql.responses = [
      [{
        id: 'outbox-1',
        user_scope_id: 'demo',
        profile_id: 'profile-a',
        workflow_type: 'therapist_outreach',
        contact_id: 'contact-1',
        consent_id: 'consent-1',
        payload_json: { deliveryMode: 'mock' },
        status: 'pending',
        created_at: new Date(1760000000000).toISOString(),
        updated_at: new Date(1760000000000).toISOString(),
        processed_at: null,
      }],
      [{
        id: 'event-1',
        workflow_outbox_id: 'outbox-1',
        event_type: 'outbox_created',
        payload_json: { deliveryMode: 'mock' },
        created_at: new Date(1760000000000).toISOString(),
      }],
    ];
    const store = new SupabaseWorkflowStateStore(sql);

    await store.enqueueOutbox({
      id: 'outbox-1',
      userScopeId: 'demo',
      profileId: 'profile-a',
      workflowType: 'therapist_outreach',
      contactId: 'contact-1',
      consentId: 'consent-1',
      payload: { deliveryMode: 'mock' },
      status: 'pending',
      createdAt: 1760000000000,
      updatedAt: 1760000000000,
    });
    await store.appendEvent({
      id: 'event-1',
      workflowOutboxId: 'outbox-1',
      eventType: 'outbox_created',
      payload: { deliveryMode: 'mock' },
      createdAt: 1760000000000,
    });

    expect(sql.queries[0]).toContain('insert into workflow_outbox');
    expect(sql.queries[1]).toContain('insert into workflow_events');
  });
});
