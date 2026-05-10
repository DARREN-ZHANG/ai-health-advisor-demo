export type LlmProvider = 'openai' | 'anthropic' | 'gemini';

/** LLM 角色类型：solver 生成回答，planner 生成计划，reviewer 审核质量 */
export type LlmRole = 'solver' | 'planner' | 'reviewer';

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

/** 所有角色的 LLM 配置集合 */
export interface ResolvedLlmConfig {
  solver: ResolvedProviderConfig;
  planner: ResolvedProviderConfig;
  reviewer: ResolvedProviderConfig;
}
