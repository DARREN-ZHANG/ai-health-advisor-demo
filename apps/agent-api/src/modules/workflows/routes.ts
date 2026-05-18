import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@health-advisor/shared';
import { buildMeta } from '../../utils/meta.js';

const ProposeTherapistOutreachSchema = z.object({
  profileId: z.string().min(1),
  contactId: z.string().min(1).optional(),
  reason: z.string().min(1),
});

export async function workflowRoutes(app: FastifyInstance) {
  app.post('/workflows/therapist-outreach/propose', async (request, reply) => {
    const body = ProposeTherapistOutreachSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send(createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid workflow proposal body', buildMeta(request)));
    }

    const consent = await app.memoryServices.workflow.findActiveConsent({
      userScopeId: app.memoryServices.userScopeId,
      profileId: body.data.profileId,
      workflowType: 'therapist_outreach',
      contactId: body.data.contactId,
    });
    if (!consent) {
      return reply.status(409).send(createErrorResponse(ErrorCode.CONFLICT, 'Active workflow consent is required', buildMeta(request)));
    }

    const now = Date.now();
    const outboxItem = await app.memoryServices.workflow.enqueueOutbox({
      id: crypto.randomUUID(),
      userScopeId: app.memoryServices.userScopeId,
      profileId: body.data.profileId,
      workflowType: 'therapist_outreach',
      contactId: body.data.contactId ?? consent.contactId,
      consentId: consent.id,
      payload: {
        reason: body.data.reason,
        deliveryMode: 'mock',
        emailSent: false,
      },
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });

    await app.memoryServices.workflow.appendEvent({
      id: crypto.randomUUID(),
      workflowOutboxId: outboxItem.id,
      eventType: 'outbox_created',
      payload: { deliveryMode: 'mock', emailSent: false },
      createdAt: now,
    });

    return createSuccessResponse(outboxItem, buildMeta(request));
  });
}
