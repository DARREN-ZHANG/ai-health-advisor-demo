import Fastify from 'fastify';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, type AppConfig } from './config/env.js';
import { requestContextPlugin } from './plugins/request-context.js';
import { langPlugin } from './plugins/lang-plugin.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { corsPlugin } from './plugins/cors.js';
import { metricsPlugin } from './plugins/metrics.js';
import { createRuntimeRegistry } from './runtime/registry.js';
import { validateStartupAssets } from './runtime/startup-validator.js';
import { healthRoutes } from './routes/health.js';
import { profileRoutes } from './modules/profiles/routes.js';
import { dataRoutes } from './modules/data/routes.js';
import { aiRoutes } from './modules/ai/routes.js';
import { godModeRoutes } from './modules/god-mode/routes.js';
import { memoryRoutes } from './modules/memory/routes.js';
import { workflowRoutes } from './modules/workflows/routes.js';
import { BriefCache } from './services/brief-cache.js';
import { createMemoryServices } from './runtime/memory-services.js';
import { LlmMemoryExtractionService } from '@health-advisor/agent-core';

export interface BuildAppOptions {
  env?: Record<string, string | undefined>;
  config?: AppConfig;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const config = options.config ?? loadConfig(options.env);

  // 启动时资产校验
  const validation = validateStartupAssets(config.dataDir);
  if (validation.fatal.length > 0) {
    // 致命错误：profiles/fallbacks 缺失，无法启动
    for (const err of validation.fatal) {
      console.error(`[startup] FATAL: ${err}`);
    }
    process.exit(1);
  }
  // 非致命警告：prompts 缺失，降级继续
  for (const warn of validation.warnings) {
    console.warn(`[startup] WARN: ${warn}`);
  }
  if (validation.fatal.length === 0 && validation.warnings.length === 0) {
    console.info('[startup] All asset validations passed');
  }

  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport: config.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
    },
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
  });

  // 注册插件（顺序重要：requestContext 必须在 cors 之前，否则 OPTIONS preflight 会跳过 ctx 初始化）
  await app.register(requestContextPlugin);
  await app.register(langPlugin);
  await app.register(corsPlugin, { config });
  await app.register(errorHandlerPlugin);
  await app.register(metricsPlugin);

  // 创建运行时注册表
  const registry = createRuntimeRegistry(config, app.metrics);
  const briefCache = new BriefCache();
  const memoryServices = createMemoryServices(config);

  if (config.MEMORY_EXTRACTION_ENABLED && !config.FALLBACK_ONLY_MODE) {
    memoryServices.extractor = new LlmMemoryExtractionService({
      agent: registry.agent,
      prompt: readFileSync(join(config.dataDir, 'prompts', 'memory-extraction.md'), 'utf-8'),
    });
  }

  // 装饰 Fastify 实例
  app.decorate('runtime', registry);
  app.decorate('config', config);
  app.decorate('briefCache', briefCache);
  app.decorate('memoryServices', memoryServices);

  // 注册路由
  await app.register(healthRoutes);
  await app.register(profileRoutes);
  await app.register(dataRoutes);
  await app.register(aiRoutes);
  await app.register(memoryRoutes);
  await app.register(workflowRoutes);

  // God-Mode 路由受 ENABLE_GOD_MODE 环境变量保护
  if (config.ENABLE_GOD_MODE) {
    await app.register(godModeRoutes);
  }

  return app;
}
