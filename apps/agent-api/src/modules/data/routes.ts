import type { FastifyInstance } from 'fastify';
import { createSuccessResponse, createErrorResponse, ErrorCode } from '@health-advisor/shared';
import type { ApiMeta, DataTab, Timeframe } from '@health-advisor/shared';
import { DataTabSchema, TimeframeSchema, isValidChartTokenId, ChartTokenId } from '@health-advisor/shared';
import { DataService } from './service.js';
import { ChartService } from './chart-service.js';

function buildMeta(request: { ctx?: { requestId: string; startTime: number }; id: string }): ApiMeta {
  const startTime = request.ctx?.startTime ?? performance.now();
  return {
    timestamp: new Date().toISOString(),
    requestId: request.ctx?.requestId ?? request.id,
    durationMs: Math.round(performance.now() - startTime),
  };
}

export async function dataRoutes(app: FastifyInstance) {
  // BE-014: Timeline 只读路由
  app.get<{
    Params: { profileId: string };
    Querystring: { timeframe?: string; startDate?: string; endDate?: string };
  }>('/profiles/:profileId/timeline', async (request, reply) => {
    const { profileId } = request.params;
    const timeframe = (request.query.timeframe ?? 'week') as Timeframe;
    const customDateRange = request.query.startDate && request.query.endDate
      ? { start: request.query.startDate, end: request.query.endDate }
      : undefined;

    const parsedTimeframe = TimeframeSchema.safeParse(timeframe);
    if (!parsedTimeframe.success) {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid timeframe', buildMeta(request)),
      );
    }

    try {
      const service = new DataService(app.runtime);
      const data = service.getTimelineData(profileId, parsedTimeframe.data, customDateRange);
      return createSuccessResponse(data, buildMeta(request));
    } catch {
      return reply.status(404).send(
        createErrorResponse(ErrorCode.PROFILE_NOT_FOUND, `Profile ${profileId} not found`, buildMeta(request)),
      );
    }
  });

  // BE-015: Data-Center 只读路由
  app.get<{
    Params: { profileId: string };
    Querystring: { tab?: string; timeframe?: string; startDate?: string; endDate?: string };
  }>('/profiles/:profileId/data', async (request, reply) => {
    const { profileId } = request.params;
    const tab = (request.query.tab ?? 'hrv') as DataTab;
    const timeframe = (request.query.timeframe ?? 'week') as Timeframe;
    const customDateRange = request.query.startDate && request.query.endDate
      ? { start: request.query.startDate, end: request.query.endDate }
      : undefined;

    const parsedTab = DataTabSchema.safeParse(tab);
    if (!parsedTab.success) {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, `Invalid tab: ${tab}`, buildMeta(request)),
      );
    }

    const parsedTimeframe = TimeframeSchema.safeParse(timeframe);
    if (!parsedTimeframe.success) {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid timeframe', buildMeta(request)),
      );
    }

    try {
      const service = new DataService(app.runtime);
      const data = service.getDataCenterData(profileId, parsedTab.data, parsedTimeframe.data, customDateRange);
      return createSuccessResponse(data, buildMeta(request));
    } catch {
      return reply.status(404).send(
        createErrorResponse(ErrorCode.PROFILE_NOT_FOUND, `Profile ${profileId} not found`, buildMeta(request)),
      );
    }
  });

  // BE-016: Chart-Data 专用路由
  app.get<{
    Params: { profileId: string };
    Querystring: { tokens?: string; timeframe?: string; startDate?: string; endDate?: string };
  }>('/profiles/:profileId/chart-data', async (request, reply) => {
    const { profileId } = request.params;
    const tokensParam = request.query.tokens ?? '';
    const timeframe = (request.query.timeframe ?? 'week') as Timeframe;
    const customDateRange = request.query.startDate && request.query.endDate
      ? { start: request.query.startDate, end: request.query.endDate }
      : undefined;

    const parsedTimeframe = TimeframeSchema.safeParse(timeframe);
    if (!parsedTimeframe.success) {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid timeframe', buildMeta(request)),
      );
    }

    const rawTokens = tokensParam.split(',').map((t) => t.trim()).filter(Boolean);
    const validTokens: ChartTokenId[] = rawTokens.filter(isValidChartTokenId) as ChartTokenId[];

    if (validTokens.length === 0) {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'No valid chart tokens provided', buildMeta(request)),
      );
    }

    try {
      const service = new ChartService(app.runtime);
      const data = service.getChartData(profileId, validTokens, parsedTimeframe.data, customDateRange);
      return createSuccessResponse(data, buildMeta(request));
    } catch {
      return reply.status(404).send(
        createErrorResponse(ErrorCode.PROFILE_NOT_FOUND, `Profile ${profileId} not found`, buildMeta(request)),
      );
    }
  });
}
