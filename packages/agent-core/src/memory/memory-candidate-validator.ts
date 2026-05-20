import { MemoryKindSchema } from './durable-memory-schema';

export interface ExtractedMemoryCandidate {
  kind: string;
  canonicalKey: string;
  payload: Record<string, unknown>;
  evidenceQuote: string;
  source: 'user_declared' | 'model_inferred' | 'sensor_inferred';
  confidence: 'explicit' | 'ambiguous';
  proposedConfirmationText: string;
  requiresConfirmation: boolean;
}

export type CandidateValidationResult =
  | { valid: true }
  | {
      valid: false;
      reason:
        | 'unsupported_kind'
        | 'missing_canonical_key'
        | 'missing_evidence_quote'
        | 'source_not_user_declared'
        | 'confirmation_required'
        | 'missing_confirmation_text';
    };

export function validateExtractedMemoryCandidate(
  candidate: ExtractedMemoryCandidate,
): CandidateValidationResult {
  if (!MemoryKindSchema.safeParse(candidate.kind).success) {
    return { valid: false, reason: 'unsupported_kind' };
  }
  if (candidate.canonicalKey.trim().length === 0) {
    return { valid: false, reason: 'missing_canonical_key' };
  }
  if (candidate.evidenceQuote.trim().length === 0) {
    return { valid: false, reason: 'missing_evidence_quote' };
  }
  if (candidate.source !== 'user_declared') {
    return { valid: false, reason: 'source_not_user_declared' };
  }
  if (!candidate.requiresConfirmation) {
    return { valid: false, reason: 'confirmation_required' };
  }
  if (candidate.proposedConfirmationText.trim().length === 0) {
    return { valid: false, reason: 'missing_confirmation_text' };
  }
  return { valid: true };
}
