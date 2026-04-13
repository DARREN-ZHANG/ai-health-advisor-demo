import Fastify from 'fastify';
import { loadConfig } from './config/env.js';
import { requestContextPlugin } from './plugins/request-context.js';
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

export async function buildApp() {
  const config = loadConfig();

  // 启动时资产校验
  const validation = validateStartupAssets(config.dataDir);
  if (validation.fatal.length > 0) {
    // 致命错误：profiles/fallbacks 缺失，无法启动
    for (const err of validation.fatal) {
      console.error(`[startup] FATAL: ${err}`);
    }
    process.exit(1);
  }
  // 非致命警告：prompts/scenarios 缺失，降级继续
  for (const warn of validation.warnings) {
    console.warn(`[startup] WARN: ${warn}`);
  }
  if (validation.fatal.length === 0 && validation.warnings.length === 0) {
    console.info('[startup] All asset validations passed');
  }

  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport: config.NODE_ENV === 'development'
        ? { target: 'pino-pretty' }
        : undefined,
    },
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
  });

  // 注册插件（顺序重要）
  await app.register(corsPlugin, { config });
  await app.register(requestContextPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(metricsPlugin);

  // 创建运行时注册表
  const registry = createRuntimeRegistry(config, app.metrics);

  // 装饰 Fastify 实例
  app.decorate('runtime', registry);
  app.decorate('config', config);

  // 注册路由
  await app.register(healthRoutes);
  await app.register(profileRoutes);
  await app.register(dataRoutes);
  await app.register(aiRoutes);

  // God-Mode 路由受 ENABLE_GOD_MODE 环境变量保护
  if (config.ENABLE_GOD_MODE) {
    await app.register(godModeRoutes);
  }

  return app;
}
