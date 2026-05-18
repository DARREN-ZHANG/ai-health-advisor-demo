import { z } from 'zod';

export const MemoryKindSchema = z.enum([
  'allergy',
  'medical_constraint',
  'goal',
  'preference',
  'workflow_contact',
  'workflow_consent',
  'correction',
  'revocation',
]);

export const MemoryCandidateRecordSchema = z.object({
  id: z.string().min(1),
  userScopeId: z.string().min(1),
  profileId: z.string().min(1),
  sessionId: z.string().min(1),
  sourceMessageId: z.string().min(1),
  kind: MemoryKindSchema,
  canonicalKey: z.string().min(1),
  payload: z.record(z.unknown()),
  evidenceQuote: z.string().min(1),
  confidence: z.enum(['explicit', 'ambiguous']),
  proposedConfirmationText: z.string().min(1),
  status: z.enum(['pending', 'confirmed', 'rejected', 'expired', 'superseded']),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
});

export const UserMemoryFactSchema = z.object({
  id: z.string().min(1),
  userScopeId: z.string().min(1),
  profileId: z.string().min(1),
  kind: MemoryKindSchema,
  canonicalKey: z.string().min(1),
  payload: z.record(z.unknown()),
  status: z.enum(['active', 'revoked', 'superseded']),
  sensitivity: z.enum(['standard', 'health', 'workflow']),
  sourceCandidateId: z.string().min(1),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  revokedAt: z.number().int().positive().optional(),
});
