import Fastify from 'fastify';
import { loadConfig } from './config/env.js';
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
import { GodModeService } from './modules/god-mode/service.js';
import { BriefCache } from './services/brief-cache.js';

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
      transport: config.NODE_ENV === 'development'
        ? { target: 'pino-pretty' }
        : undefined,
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

  // 装饰 Fastify 实例
  app.decorate('runtime', registry);
  app.decorate('config', config);
  app.decorate('briefCache', briefCache);

  // 注册路由
  await app.register(healthRoutes);
  await app.register(profileRoutes);
  await app.register(dataRoutes);
  await app.register(aiRoutes);

  // God-Mode 路由受 ENABLE_GOD_MODE 环境变量保护
  if (config.ENABLE_GOD_MODE) {
    await app.register(godModeRoutes);

    // 自动校准：启动时检测并校准过期的演示数据，之后每小时检查一次
    const godModeService = new GodModeService(registry);
    const startupResult = godModeService.autoCalibrate();
    app.log.info(`[auto-calibration] startup: ${startupResult.reason}`);
    if (startupResult.recalibrated) {
      briefCache.clearAll();
    }

    const calibrationTimer = setInterval(() => {
      try {
        const result = godModeService.autoCalibrate();
        if (result.recalibrated) {
          briefCache.clearAll();
          app.log.info(`[auto-calibration] scheduled: ${result.reason}`);
        }
      } catch (err) {
        app.log.error(err, '[auto-calibration] scheduled check failed');
      }
    }, 60 * 60 * 1000);

    app.addHook('onClose', () => {
      clearInterval(calibrationTimer);
    });
  }

  return app;
}
