import { z } from 'zod';
import path from 'node:path';

/** 环境变量布尔值：'true'/'1' → true，其余 → false */
const envBool = z
  .string()
  .transform((v) => v === 'true' || v === '1')
  .default('false');

const AppConfigSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LLM_PROVIDER: z.enum(['openai', 'anthropic', 'gemini']).default('openai'),
  LLM_MODEL: z.string().default('gpt-4o-mini'),
  LLM_API_KEY: z.string().default(''),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.3),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  AI_TIMEOUT_MS: z.coerce.number().positive().default(6000),
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
}).refine(
  (data) => data.FALLBACK_ONLY_MODE || data.LLM_API_KEY.length > 0,
  { message: 'LLM_API_KEY is required when FALLBACK_ONLY_MODE is false', path: ['LLM_API_KEY'] },
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
    : path.resolve(process.cwd(), 'data/sandbox');
  return { ...parsed, dataDir };
}

export { AppConfigSchema };
