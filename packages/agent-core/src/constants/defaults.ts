import type { LlmProvider, LlmRole } from '../types/provider';

export const DEFAULT_PROVIDER: LlmProvider = 'openai';
export const DEFAULT_MODEL = 'gpt-4o-mini';
export const DEFAULT_TIMEOUT_MS = 60000;
export const DEFAULT_TEMPERATURE = 0.3;
/**
 * 健康建议属于交互式请求；失败应尽快返回可重试状态，避免 SDK 重试把一次
 * 请求拖成长时间等待。需要重试由调用方显式发起。
 */
export const DEFAULT_MAX_RETRIES = 0;

/** 每个角色的默认配置：planner 低 temperature，reviewer 零 temperature */
export const ROLE_DEFAULTS: Record<LlmRole, {
  provider: LlmProvider;
  model: string;
  temperature: number;
  timeoutMs: number;
}> = {
  solver: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    temperature: 0.3,
    timeoutMs: 60000,
  },
  planner: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    temperature: 0.1,
    timeoutMs: 60000,
  },
  reviewer: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    temperature: 0.0,
    timeoutMs: 60000,
  },
};
