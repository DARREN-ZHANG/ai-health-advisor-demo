export type LlmProvider = 'openai' | 'anthropic' | 'gemini';

export interface ModelRuntimeConfig {
  provider: LlmProvider;
  model: string;
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  temperature: number;
  maxRetries: number;
}

export type ResolvedProviderConfig = ModelRuntimeConfig;
