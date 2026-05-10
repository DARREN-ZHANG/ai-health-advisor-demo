import type { ResolvedProviderConfig, ResolvedLlmConfig, LlmProvider, LlmRole } from '../types/provider';
import {
  DEFAULT_PROVIDER,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_RETRIES,
  ROLE_DEFAULTS,
} from '../constants/defaults';

export function resolveProviderConfig(
  env: Record<string, string | undefined>,
  role: LlmRole = 'solver',
): ResolvedProviderConfig {
  const defaults = ROLE_DEFAULTS[role];
  // solver 角色直接使用 LLM_* 前缀（向后兼容）
  // planner/reviewer 角色使用 {ROLE}_LLM_* 前缀，fallback 到 LLM_*
  const prefix = role === 'solver' ? 'LLM' : `${role.toUpperCase()}_LLM`;

  const provider = (env[`${prefix}_PROVIDER`] as LlmProvider) ?? (env.LLM_PROVIDER as LlmProvider) ?? defaults.provider;
  const model = env[`${prefix}_MODEL`] ?? env.LLM_MODEL ?? defaults.model;
  const apiKey = env[`${prefix}_API_KEY`] ?? env.LLM_API_KEY ?? '';
  const baseUrl = env[`${prefix}_BASE_URL`] ?? env.LLM_BASE_URL ?? '';
  const timeoutMs = env[`${prefix}_TIMEOUT_MS`]
    ? parseInt(env[`${prefix}_TIMEOUT_MS`], 10)
    : (env.LLM_TIMEOUT_MS ? parseInt(env.LLM_TIMEOUT_MS, 10) : defaults.timeoutMs);
  const temperature = env[`${prefix}_TEMPERATURE`]
    ? parseFloat(env[`${prefix}_TEMPERATURE`])
    : (env.LLM_TEMPERATURE ? parseFloat(env.LLM_TEMPERATURE) : defaults.temperature);
  const maxRetries = env[`${prefix}_MAX_RETRIES`]
    ? parseInt(env[`${prefix}_MAX_RETRIES`], 10)
    : (env.LLM_MAX_RETRIES ? parseInt(env.LLM_MAX_RETRIES, 10) : DEFAULT_MAX_RETRIES);

  return { provider, model, apiKey, baseUrl, timeoutMs, temperature, maxRetries };
}

/** 解析所有角色的 LLM 配置 */
export function resolveAllLlmConfigs(env: Record<string, string | undefined>): ResolvedLlmConfig {
  return {
    solver: resolveProviderConfig(env, 'solver'),
    planner: resolveProviderConfig(env, 'planner'),
    reviewer: resolveProviderConfig(env, 'reviewer'),
  };
}
