import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from '@health-advisor/config/vitest';
export default mergeConfig(baseConfig, defineConfig({}));
