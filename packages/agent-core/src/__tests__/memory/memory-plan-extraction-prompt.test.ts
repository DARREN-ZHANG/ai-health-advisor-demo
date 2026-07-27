import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const promptPath = resolve(
  import.meta.dirname,
  '../../../../../data/sandbox/prompts/memory-extraction.md',
);

describe('memory extraction prompt plan boundary', () => {
  it('excludes plan-management requests from durable memory extraction', () => {
    const prompt = readFileSync(promptPath, 'utf-8');

    expect(prompt).toContain('short-term plan/checklist');
    expect(prompt).toContain('immediate product operations');
    expect(prompt).toContain('already represented by the Plan module');
    expect(prompt).toContain('Return {"candidates":[]} for these requests');
  });
});
