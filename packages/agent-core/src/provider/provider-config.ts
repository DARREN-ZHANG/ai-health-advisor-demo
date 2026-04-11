import type { ResolvedProviderConfig, LlmProvider } from '../types/provider';
import {
  DEFAULT_PROVIDER,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_RETRIES,
} from '../constants/defaults';

export function resolveProviderConfig(
  env: Record<string, string | undefined>,
): ResolvedProviderConfig {
  const provider = (env.LLM_PROVIDER as LlmProvider) ?? DEFAULT_PROVIDER;
  const model = env.LLM_MODEL ?? DEFAULT_MODEL;
  const apiKey = env.LLM_API_KEY ?? '';
  const timeoutMs = env.LLM_TIMEOUT_MS ? parseInt(env.LLM_TIMEOUT_MS, 10) : DEFAULT_TIMEOUT_MS;
  const temperature = env.LLM_TEMPERATURE
    ? parseFloat(env.LLM_TEMPERATURE)
    : DEFAULT_TEMPERATURE;
  const maxRetries = env.LLM_MAX_RETRIES
    ? parseInt(env.LLM_MAX_RETRIES, 10)
    : DEFAULT_MAX_RETRIES;

  return {
    provider,
    model,
    apiKey,
    timeoutMs,
    temperature,
    maxRetries,
  };
}
