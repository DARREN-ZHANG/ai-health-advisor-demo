import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../config/env';

const validEnv: Record<string, string> = {
  PORT: '3002',
  NODE_ENV: 'development',
  LLM_PROVIDER: 'openai',
  LLM_MODEL: 'gpt-4o-mini',
  LLM_API_KEY: 'sk-test',
  AI_TIMEOUT_MS: '6000',
  ENABLE_GOD_MODE: 'true',
  FALLBACK_ONLY_MODE: 'false',
  LOG_LEVEL: 'debug',
};

describe('loadConfig', () => {
  it('解析有效环境变量', () => {
    const config = loadConfig(validEnv);
    expect(config.PORT).toBe(3002);
    expect(config.NODE_ENV).toBe('development');
    expect(config.LLM_PROVIDER).toBe('openai');
    expect(config.LLM_API_KEY).toBe('sk-test');
    expect(config.LLM_TIMEOUT_MS).toBe(5000);
    expect(config.ENABLE_GOD_MODE).toBe(true);
    expect(config.FALLBACK_ONLY_MODE).toBe(false);
  });

  it('使用默认值填充缺失字段（fallbackOnly 模式）', () => {
    const config = loadConfig({ FALLBACK_ONLY_MODE: 'true' });
    expect(config.PORT).toBe(3002);
    expect(config.NODE_ENV).toBe('development');
    expect(config.LLM_MODEL).toBe('gpt-4o-mini');
    expect(config.AI_TIMEOUT_MS).toBe(6000);
    expect(config.LLM_TIMEOUT_MS).toBe(5000);
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.FALLBACK_ONLY_MODE).toBe(true);
  });

  it('FALLBACK_ONLY_MODE=true 时允许空 API key', () => {
    const config = loadConfig({ FALLBACK_ONLY_MODE: 'true' });
    expect(config.FALLBACK_ONLY_MODE).toBe(true);
    expect(config.LLM_API_KEY).toBe('');
  });

  it('FALLBACK_ONLY_MODE=false 且无 API key 时抛错', () => {
    expect(() => loadConfig({ FALLBACK_ONLY_MODE: 'false' })).toThrow(/LLM_API_KEY/);
  });

  it('dataDir 默认为 process.cwd()/data/sandbox', () => {
    const config = loadConfig({ FALLBACK_ONLY_MODE: 'true' });
    expect(config.dataDir).toContain('data/sandbox');
  });

  it('DATA_DIR 可覆盖 dataDir', () => {
    const config = loadConfig({ DATA_DIR: '/tmp/test-data', FALLBACK_ONLY_MODE: 'true' });
    expect(config.dataDir).toBe('/tmp/test-data');
  });

  it('无效 PORT 抛错', () => {
    expect(() => loadConfig({ PORT: 'not-a-number', FALLBACK_ONLY_MODE: 'true' })).toThrow();
  });

  it('无效 NODE_ENV 抛错', () => {
    expect(() => loadConfig({ NODE_ENV: 'staging', FALLBACK_ONLY_MODE: 'true' })).toThrow();
  });

  it('布尔值正确解析："false" 为 false', () => {
    const config = loadConfig({ ...validEnv, ENABLE_GOD_MODE: 'false' });
    expect(config.ENABLE_GOD_MODE).toBe(false);
  });

  it('布尔值正确解析："1" 为 true', () => {
    const config = loadConfig({ ...validEnv, ENABLE_GOD_MODE: '1' });
    expect(config.ENABLE_GOD_MODE).toBe(true);
  });

  it('CORS_ALLOWED_ORIGINS 解析为去空白的列表', () => {
    const config = loadConfig({
      ...validEnv,
      CORS_ALLOWED_ORIGINS: ' http://localhost:3000, https://demo.example.com ',
    });

    expect(config.CORS_ALLOWED_ORIGINS).toEqual([
      'http://localhost:3000',
      'https://demo.example.com',
    ]);
  });

  it('LLM_TIMEOUT_MS 可覆盖 provider 超时', () => {
    const config = loadConfig({ ...validEnv, LLM_TIMEOUT_MS: '60000' });
    expect(config.LLM_TIMEOUT_MS).toBe(60000);
  });
});
