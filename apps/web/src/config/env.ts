import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_AGENT_API_BASE_URL: z.string().url().default('http://localhost:3001'),
  NEXT_PUBLIC_ENABLE_GOD_MODE: z.string().transform((v) => v === 'true').default('true'),
});

// 优雅降级：解析失败时使用默认值，避免顶层 throw 导致白屏
const raw = {
  NEXT_PUBLIC_AGENT_API_BASE_URL: process.env.NEXT_PUBLIC_AGENT_API_BASE_URL || undefined,
  NEXT_PUBLIC_ENABLE_GOD_MODE: process.env.NEXT_PUBLIC_ENABLE_GOD_MODE || undefined,
};

const _env = envSchema.safeParse(raw);

if (!_env.success) {
  console.warn('环境变量校验失败，使用默认值:', _env.error.format());
}

export const env = _env.success
  ? _env.data
  : envSchema.parse({});
