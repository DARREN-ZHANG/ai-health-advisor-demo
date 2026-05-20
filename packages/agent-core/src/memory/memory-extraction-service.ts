import { z } from 'zod';
import type { HealthAgent } from '../executor/create-agent';
import type { ExtractedMemoryCandidate } from './memory-candidate-validator';
import { validateExtractedMemoryCandidate } from './memory-candidate-validator';

const ExtractionResponseSchema = z.object({
  candidates: z.array(z.object({
    kind: z.string(),
    canonicalKey: z.string(),
    payload: z.record(z.unknown()),
    evidenceQuote: z.string(),
    source: z.enum(['user_declared', 'model_inferred', 'sensor_inferred']),
    confidence: z.enum(['explicit', 'ambiguous']),
    proposedConfirmationText: z.string(),
    requiresConfirmation: z.boolean(),
  })),
});

export interface MemoryExtractionInput {
  userMessage: string;
  profileId: string;
  sessionId: string;
}

export interface MemoryExtractionResult {
  candidates: ExtractedMemoryCandidate[];
  rejectedCount: number;
}

export interface MemoryExtractionService {
  extract(input: MemoryExtractionInput): Promise<MemoryExtractionResult>;
}

export class LlmMemoryExtractionService implements MemoryExtractionService {
  constructor(private readonly deps: { agent: HealthAgent; prompt: string }) {}

  async extract(input: MemoryExtractionInput): Promise<MemoryExtractionResult> {
    const raw = await this.deps.agent.invoke({
      systemPrompt: this.deps.prompt,
      userPrompt: JSON.stringify({
        userMessage: input.userMessage,
        profileId: input.profileId,
        sessionId: input.sessionId,
      }),
    });

    const parsedJson = JSON.parse(raw.content) as unknown;
    const parsed = ExtractionResponseSchema.parse(parsedJson);
    const candidates: ExtractedMemoryCandidate[] = [];
    let rejectedCount = 0;

    for (const candidate of parsed.candidates) {
      const validation = validateExtractedMemoryCandidate(candidate);
      if (validation.valid) {
        candidates.push(candidate);
      } else {
        rejectedCount += 1;
      }
    }

    return { candidates, rejectedCount };
  }
}
