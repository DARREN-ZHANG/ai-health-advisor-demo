import { describe, expect, it } from 'vitest';
import { buildApp } from '../../../app';

describe('workflow demo routes', () => {
  it('persists a mock outbox action and audit event without sending email', async () => {
    const app = await buildApp({
      env: { FALLBACK_ONLY_MODE: 'true', ENABLE_GOD_MODE: 'false', MEMORY_BACKEND: 'memory' },
    });
    await app.memoryServices.workflow.upsertContact({
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
    await app.memoryServices.workflow.upsertConsent({
      id: 'consent-1',
      userScopeId: 'demo',
      profileId: 'profile-a',
      workflowType: 'therapist_outreach',
      contactId: 'contact-1',
      scope: { deliveryMode: 'mock' },
      status: 'active',
      createdAt: 1760000000000,
      updatedAt: 1760000000000,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/workflows/therapist-outreach/propose',
      headers: { 'x-session-id': 'sess-1' },
      payload: {
        profileId: 'profile-a',
        contactId: 'contact-1',
        reason: '用户确认疲劳并授权联系理疗师',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe('pending');
    expect(response.json().data.payload.deliveryMode).toBe('mock');
    expect(response.json().data.payload.emailSent).toBe(false);
    expect(await app.memoryServices.workflow.listEvents(response.json().data.id)).toHaveLength(1);

    await app.close();
  });

  it('rejects workflow outbox creation without active consent', async () => {
    const app = await buildApp({
      env: { FALLBACK_ONLY_MODE: 'true', ENABLE_GOD_MODE: 'false', MEMORY_BACKEND: 'memory' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/workflows/therapist-outreach/propose',
      headers: { 'x-session-id': 'sess-1' },
      payload: {
        profileId: 'profile-a',
        reason: '用户确认疲劳',
      },
    });

    expect(response.statusCode).toBe(409);

    await app.close();
  });
});
