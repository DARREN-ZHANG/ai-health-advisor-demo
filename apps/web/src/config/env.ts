import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_AGENT_API_BASE_URL: z.string().url().default('http://localhost:3001'),
  NEXT_PUBLIC_ENABLE_GOD_MODE: z.string().transform((v) => v === 'true').default('true'),
});

const _env = envSchema.safeParse({
  NEXT_PUBLIC_AGENT_API_BASE_URL: process.env.NEXT_PUBLIC_AGENT_API_BASE_URL,
  NEXT_PUBLIC_ENABLE_GOD_MODE: process.env.NEXT_PUBLIC_ENABLE_GOD_MODE,
});

if (!_env.success) {
  console.error('❌ 环境变量校验失败:', _env.error.format());
  throw new Error('环境变量校验失败');
}

export const env = _env.data;
