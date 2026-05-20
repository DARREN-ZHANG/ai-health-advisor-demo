import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@health-advisor/shared';
import { buildMeta } from '../../utils/meta.js';
import type { MemoryCandidateRecord } from '@health-advisor/agent-core';

const CandidateActionBodySchema = z.object({
  profileId: z.string().min(1),
});

async function persistWorkflowMemory(app: FastifyInstance, candidate: MemoryCandidateRecord, now: number) {
  if (candidate.kind === 'workflow_contact') {
    await app.memoryServices.workflow.upsertContact({
      id: typeof candidate.payload.contactId === 'string' ? candidate.payload.contactId : crypto.randomUUID(),
      userScopeId: candidate.userScopeId,
      profileId: candidate.profileId,
      contactType: candidate.payload.contactType === 'therapist' ? 'therapist' : 'other',
      displayName: typeof candidate.payload.displayName === 'string' ? candidate.payload.displayName : 'Demo contact',
      email: typeof candidate.payload.email === 'string' ? candidate.payload.email : undefined,
      phone: typeof candidate.payload.phone === 'string' ? candidate.payload.phone : undefined,
      metadata: candidate.payload,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
  }

  if (candidate.kind === 'workflow_consent') {
    await app.memoryServices.workflow.upsertConsent({
      id: typeof candidate.payload.consentId === 'string' ? candidate.payload.consentId : crypto.randomUUID(),
      userScopeId: candidate.userScopeId,
      profileId: candidate.profileId,
      workflowType: typeof candidate.payload.workflowType === 'string' ? candidate.payload.workflowType : 'therapist_outreach',
      contactId: typeof candidate.payload.contactId === 'string' ? candidate.payload.contactId : undefined,
      scope: candidate.payload,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function memoryRoutes(app: FastifyInstance) {
  app.get('/memory/candidates', async (request, reply) => {
    const profileId = typeof request.query === 'object' && request.query && 'profileId' in request.query
      ? String((request.query as { profileId: string }).profileId)
      : '';
    if (!profileId) {
      return reply.status(400).send(createErrorResponse(ErrorCode.VALIDATION_ERROR, 'profileId is required', buildMeta(request)));
    }

    const candidates = await app.memoryServices.candidates.listPending({
      userScopeId: app.memoryServices.userScopeId,
      profileId,
      sessionId: request.ctx.sessionId,
      now: Date.now(),
    });

    return createSuccessResponse(candidates.map((candidate) => ({
      id: candidate.id,
      kind: candidate.kind,
      proposedConfirmationText: candidate.proposedConfirmationText,
      evidenceQuote: candidate.evidenceQuote,
    })), buildMeta(request));
  });

  app.post('/memory/candidates/:id/confirm', async (request, reply) => {
    const params = request.params as { id: string };
    const body = CandidateActionBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send(createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid memory confirmation body', buildMeta(request)));
    }

    const candidate = await app.memoryServices.candidates.getCandidate(params.id);
    if (!candidate || candidate.profileId !== body.data.profileId || candidate.sessionId !== request.ctx.sessionId) {
      return reply.status(404).send(createErrorResponse(ErrorCode.NOT_FOUND, 'Memory candidate not found', buildMeta(request)));
    }
    if (candidate.status !== 'pending' || candidate.expiresAt <= Date.now()) {
      return reply.status(409).send(createErrorResponse(ErrorCode.CONFLICT, 'Memory candidate is not pending', buildMeta(request)));
    }

    const now = Date.now();
    const result = await app.memoryServices.durable.confirmCandidate({ candidate, now });
    await persistWorkflowMemory(app, candidate, now);
    return createSuccessResponse(result.fact, buildMeta(request));
  });

  app.post('/memory/candidates/:id/reject', async (request, reply) => {
    const params = request.params as { id: string };
    const body = CandidateActionBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send(createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid memory rejection body', buildMeta(request)));
    }

    const candidate = await app.memoryServices.candidates.getCandidate(params.id);
    if (!candidate || candidate.profileId !== body.data.profileId || candidate.sessionId !== request.ctx.sessionId) {
      return reply.status(404).send(createErrorResponse(ErrorCode.NOT_FOUND, 'Memory candidate not found', buildMeta(request)));
    }

    const updated = await app.memoryServices.candidates.setCandidateStatus(params.id, 'rejected', Date.now());
    return createSuccessResponse(updated, buildMeta(request));
  });
}
