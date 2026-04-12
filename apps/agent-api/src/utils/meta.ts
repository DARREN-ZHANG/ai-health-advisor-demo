import type { ApiMeta } from '@health-advisor/shared';

/**
 * 从请求上下文构建统一的 API 响应元数据
 */
export function buildMeta(request: { ctx?: { requestId: string; startTime: number }; id: string }): ApiMeta {
  const startTime = request.ctx?.startTime ?? performance.now();
  return {
    timestamp: new Date().toISOString(),
    requestId: request.ctx?.requestId ?? request.id,
    durationMs: Math.round(performance.now() - startTime),
  };
}
