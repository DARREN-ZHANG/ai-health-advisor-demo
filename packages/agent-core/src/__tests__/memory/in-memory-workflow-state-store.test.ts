import { describe, expect, it } from 'vitest';
import { InMemoryWorkflowStateStore } from '../../memory/in-memory-workflow-state-store';

describe('InMemoryWorkflowStateStore', () => {
  it('finds active consent and persists outbox events', async () => {
    const store = new InMemoryWorkflowStateStore();
    const contact = await store.upsertContact({
      id: 'contact-1',
      userScopeId: 'demo',
      profileId: 'profile-a',
      contactType: 'therapist',
      displayName: 'Demo Therapist',
      email: 'therapist@example.com',
      metadata: {},
      status: 'active',
      createdAt: 1760000000000,
      updatedAt: 1760000000000,
    });
    const consent = await store.upsertConsent({
      id: 'consent-1',
      userScopeId: 'demo',
      profileId: 'profile-a',
      workflowType: 'therapist_outreach',
      contactId: contact.id,
      scope: { deliveryMode: 'mock' },
      status: 'active',
      createdAt: 1760000000000,
      updatedAt: 1760000000000,
    });

    const active = await store.findActiveConsent({
      userScopeId: 'demo',
      profileId: 'profile-a',
      workflowType: 'therapist_outreach',
    });
    const outbox = await store.enqueueOutbox({
      id: 'outbox-1',
      userScopeId: 'demo',
      profileId: 'profile-a',
      workflowType: 'therapist_outreach',
      contactId: contact.id,
      consentId: consent.id,
      payload: { reason: '用户确认疲劳并授权联系理疗师', deliveryMode: 'mock' },
      status: 'pending',
      createdAt: 1760000001000,
      updatedAt: 1760000001000,
    });
    await store.appendEvent({
      id: 'event-1',
      workflowOutboxId: outbox.id,
      eventType: 'outbox_created',
      payload: { deliveryMode: 'mock' },
      createdAt: 1760000001000,
    });

    expect(active?.id).toBe('consent-1');
    expect(await store.listEvents(outbox.id)).toHaveLength(1);
  });
});
