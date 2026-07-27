import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const promptPath = resolve(import.meta.dirname, '../../../../../data/sandbox/prompts/memory-extraction.md');

describe('memory extraction prompt', () => {
  it('documents the durable memory candidate schema', () => {
    const prompt = readFileSync(promptPath, 'utf-8');

    expect(prompt).toContain('"candidates"');
    expect(prompt).toContain('"kind"');
    expect(prompt).toContain('"canonicalKey"');
    expect(prompt).toContain('"evidenceQuote"');
    expect(prompt).toContain('"proposedConfirmationText"');
    expect(prompt).toContain('"requiresConfirmation": true');
  });

  it('excludes transient UI control requests from extraction', () => {
    // 回归保护：UI 控制意图（如"在首页显示 Sleep"）是瞬时界面操作，
    // 不含值得长期记忆的健康事实，extractor 必须对这类消息返回空候选。
    const prompt = readFileSync(promptPath, 'utf-8');

    expect(prompt).toContain('transient UI control');
    expect(prompt).toContain('immediate interface operations');
    expect(prompt).toContain('not durable facts');
  });
});
