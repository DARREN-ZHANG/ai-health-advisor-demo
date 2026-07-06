import path from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from '@health-advisor/config/vitest';

export default mergeConfig(
  baseConfig,
  defineConfig({
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    // Next.js 在构建期处理 JSX；vitest 走 esbuild 转译时，
    // 需要显式声明 jsx runtime，避免 "React is not defined"。
    esbuild: {
      jsx: 'automatic',
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test-setup.ts'],
    },
  })
);
