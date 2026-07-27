import { z } from 'zod';
import path from 'node:path';

// 基于 src/config/ 的位置推导项目根目录（monorepo root/data/sandbox）
const monorepoRoot = path.resolve(__dirname, '../../../..');

/** 环境变量布尔值：'true'/'1' → true，其余 → false */
const envBool = z
  .string()
  .transform((v) => v === 'true' || v === '1')
  .default('false');

const AppConfigSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LLM_PROVIDER: z.enum(['openai', 'anthropic', 'gemini']).default('openai'),
  LLM_MODEL: z.string().default('gpt-4o-mini'),
  LLM_BASE_URL: z.string().default(''),
  LLM_API_KEY: z.string().default(''),
  // 不设 Zod 默认值，让 resolveProviderConfig 通过 ROLE_DEFAULTS 提供角色级默认值
  // 避免 LLM_TEMPERATURE=0.3 覆盖 planner 默认的 0.1 和 reviewer 默认的 0.0
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).optional(),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(5).optional(),
  LLM_TIMEOUT_MS: z.coerce.number().positive().default(60000),
  // Planner 角色独立配置（可选，不设置时 fallback 到 LLM_*）
  PLANNER_LLM_PROVIDER: z.enum(['openai', 'anthropic', 'gemini']).optional(),
  PLANNER_LLM_MODEL: z.string().optional(),
  PLANNER_LLM_API_KEY: z.string().optional(),
  PLANNER_LLM_BASE_URL: z.string().optional(),
  PLANNER_LLM_TEMPERATURE: z.coerce.number().min(0).max(2).optional(),
  PLANNER_LLM_TIMEOUT_MS: z.coerce.number().positive().optional(),
  PLANNER_LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(5).optional(),
  // Reviewer 角色独立配置（可选，不设置时 fallback 到 LLM_*）
  REVIEWER_LLM_PROVIDER: z.enum(['openai', 'anthropic', 'gemini']).optional(),
  REVIEWER_LLM_MODEL: z.string().optional(),
  REVIEWER_LLM_API_KEY: z.string().optional(),
  REVIEWER_LLM_BASE_URL: z.string().optional(),
  REVIEWER_LLM_TEMPERATURE: z.coerce.number().min(0).max(2).optional(),
  REVIEWER_LLM_TIMEOUT_MS: z.coerce.number().positive().optional(),
  REVIEWER_LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(5).optional(),
  // Reviewer 运行模式：off=完全关闭，sync=仅高风险同步审核，full=同步审核+异步质量观测
  REVIEWER_MODE: z.enum(['off', 'sync', 'full']).default('full'),
  AI_TIMEOUT_MS: z.coerce.number().positive().default(60000),
  ENABLE_GOD_MODE: envBool,
  FALLBACK_ONLY_MODE: envBool,
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .optional()
    .transform((value) =>
      value
        ?.split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0) ?? []
    ),
  DATA_DIR: z.string().optional(),
  MEMORY_BACKEND: z.enum(['memory', 'supabase']).default('memory'),
  SUPABASE_DB_URL: z.string().optional(),
  MEMORY_EXTRACTION_ENABLED: envBool.default('false'),
  MEMORY_CANDIDATE_TTL_HOURS: z.coerce.number().positive().default(24),
  DEMO_USER_SCOPE_ID: z.string().min(1).default('demo'),
  // Web Search 配置（Tavily）
  TAVILY_API_KEY: z.string().optional(),
  WEB_SEARCH_ENABLED: envBool,
  WEB_SEARCH_MAX_RESULTS: z.coerce.number().int().positive().max(10).default(3),
  WEB_SEARCH_TIMEOUT_MS: z.coerce.number().positive().default(10000),
}).refine(
  (data) => data.FALLBACK_ONLY_MODE || data.LLM_API_KEY.length > 0,
  { message: 'LLM_API_KEY is required when FALLBACK_ONLY_MODE is false', path: ['LLM_API_KEY'] },
).refine(
  (data) => data.MEMORY_BACKEND !== 'supabase' || Boolean(data.SUPABASE_DB_URL),
  { message: 'SUPABASE_DB_URL is required when MEMORY_BACKEND is supabase', path: ['SUPABASE_DB_URL'] },
).refine(
  (data) => !data.WEB_SEARCH_ENABLED || Boolean(data.TAVILY_API_KEY),
  { message: 'TAVILY_API_KEY is required when WEB_SEARCH_ENABLED is true', path: ['TAVILY_API_KEY'] },
);

export type AppConfig = z.infer<typeof AppConfigSchema> & {
  /** 解析后的绝对路径 */
  dataDir: string;
};

export function loadConfig(env?: Record<string, string | undefined>): AppConfig {
  const source = env ?? process.env;
  const parsed = AppConfigSchema.parse(source);
  const dataDir = parsed.DATA_DIR
    ? path.resolve(parsed.DATA_DIR)
    : path.resolve(monorepoRoot, 'data/sandbox');
  return { ...parsed, dataDir };
}

export { AppConfigSchema };
