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
  })
);
