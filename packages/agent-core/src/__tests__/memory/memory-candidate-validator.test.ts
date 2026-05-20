import { describe, expect, it } from 'vitest';
import { validateExtractedMemoryCandidate } from '../../memory/memory-candidate-validator';

const base = {
  kind: 'allergy' as const,
  canonicalKey: 'allergy:peanut',
  payload: { allergen: 'peanut', severity: 'unknown' },
  evidenceQuote: '我对花生过敏',
  source: 'user_declared' as const,
  confidence: 'explicit' as const,
  proposedConfirmationText: '是否记住：你对花生过敏？',
  requiresConfirmation: true,
};

describe('validateExtractedMemoryCandidate', () => {
  it('accepts explicit user-declared evidence-backed candidates', () => {
    expect(validateExtractedMemoryCandidate(base)).toEqual({ valid: true });
  });

  it('rejects inferred candidates', () => {
    expect(validateExtractedMemoryCandidate({ ...base, source: 'model_inferred' })).toEqual({
      valid: false,
      reason: 'source_not_user_declared',
    });
  });

  it('rejects candidates without evidence quote', () => {
    expect(validateExtractedMemoryCandidate({ ...base, evidenceQuote: '' })).toEqual({
      valid: false,
      reason: 'missing_evidence_quote',
    });
  });

  it('rejects candidates that do not require confirmation', () => {
    expect(validateExtractedMemoryCandidate({ ...base, requiresConfirmation: false })).toEqual({
      valid: false,
      reason: 'confirmation_required',
    });
  });
});
