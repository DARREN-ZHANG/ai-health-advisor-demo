import Fastify from 'fastify';
import { loadConfig } from './config/env.js';
import { requestContextPlugin } from './plugins/request-context.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { corsPlugin } from './plugins/cors.js';
import { metricsPlugin } from './plugins/metrics.js';
import { createRuntimeRegistry } from './runtime/registry.js';
import { healthRoutes } from './routes/health.js';
import { profileRoutes } from './modules/profiles/routes.js';
import { dataRoutes } from './modules/data/routes.js';
import { aiRoutes } from './modules/ai/routes.js';
import { godModeRoutes } from './modules/god-mode/routes.js';

export async function buildApp() {
  const config = loadConfig();

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
