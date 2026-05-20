import { describe, expect, it } from 'vitest';
import { createHealthAgent } from '../../executor/create-agent';
import { FakeChatModel } from '../../provider/fake-chat-model';
import { LlmMemoryExtractionService } from '../../memory/memory-extraction-service';

describe('LlmMemoryExtractionService', () => {
  it('returns validated candidates from strict JSON output', async () => {
    const agent = createHealthAgent({ chatModel: new FakeChatModel(JSON.stringify({
      candidates: [
        {
          kind: 'allergy',
          canonicalKey: 'allergy:peanut',
          payload: { allergen: 'peanut', severity: 'unknown' },
          evidenceQuote: '我对花生过敏',
          source: 'user_declared',
          confidence: 'explicit',
          proposedConfirmationText: '是否记住：你对花生过敏？',
          requiresConfirmation: true,
        },
      ],
    })) });

    const service = new LlmMemoryExtractionService({
      agent,
      prompt: 'Extract memory candidates as JSON.',
    });

    const result = await service.extract({
      userMessage: '我对花生过敏',
      profileId: 'profile-a',
      sessionId: 'sess-1',
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.canonicalKey).toBe('allergy:peanut');
  });

  it('returns empty array when no candidates exist', async () => {
    const agent = createHealthAgent({ chatModel: new FakeChatModel(JSON.stringify({ candidates: [] })) });

    const service = new LlmMemoryExtractionService({
      agent,
      prompt: 'Extract memory candidates as JSON.',
    });

    const result = await service.extract({
      userMessage: 'Hello',
      profileId: 'profile-a',
      sessionId: 'sess-1',
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.rejectedCount).toBe(0);
  });

  it('rejects invalid candidates and increments rejectedCount', async () => {
    const agent = createHealthAgent({ chatModel: new FakeChatModel(JSON.stringify({
      candidates: [
        {
          kind: 'allergy',
          canonicalKey: 'allergy:peanut',
          payload: {},
          evidenceQuote: '我对花生过敏',
          source: 'model_inferred',
          confidence: 'explicit',
          proposedConfirmationText: '是否记住：你对花生过敏？',
          requiresConfirmation: true,
        },
      ],
    })) });

    const service = new LlmMemoryExtractionService({
      agent,
      prompt: 'Extract memory candidates as JSON.',
    });

    const result = await service.extract({
      userMessage: '我对花生过敏',
      profileId: 'profile-a',
      sessionId: 'sess-1',
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.rejectedCount).toBe(1);
  });
});
