import { describe, it, expect } from 'vitest';
import { resolveProviderConfig } from '../../provider/provider-config';

describe('resolveProviderConfig', () => {
  it('returns defaults when no env vars set', () => {
    const config = resolveProviderConfig({});
    expect(config.provider).toBe('openai');
    expect(config.model).toBe('gpt-4o-mini');
    expect(config.apiKey).toBe('');
    expect(config.timeoutMs).toBe(5000);
    expect(config.temperature).toBe(0.3);
    expect(config.maxRetries).toBe(0);
  });

  it('reads env vars when provided', () => {
    const config = resolveProviderConfig({
      LLM_PROVIDER: 'openai',
      LLM_MODEL: 'gpt-4o',
      LLM_API_KEY: 'sk-test',
      LLM_TIMEOUT_MS: '8000',
      LLM_TEMPERATURE: '0.5',
      LLM_MAX_RETRIES: '2',
    });
    expect(config.provider).toBe('openai');
    expect(config.model).toBe('gpt-4o');
    expect(config.apiKey).toBe('sk-test');
    expect(config.timeoutMs).toBe(8000);
    expect(config.temperature).toBe(0.5);
    expect(config.maxRetries).toBe(2);
  });
});
