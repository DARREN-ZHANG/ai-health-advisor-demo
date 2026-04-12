import type { FastifyInstance } from 'fastify';
import { createSuccessResponse, createErrorResponse, ErrorCode } from '@health-advisor/shared';
import type { DataTab, Timeframe } from '@health-advisor/shared';
import { DataTabSchema, TimeframeSchema, isValidChartTokenId, ChartTokenId } from '@health-advisor/shared';
import { buildMeta } from '../../utils/meta.js';
import { DataService } from './service.js';
import { ChartService } from './chart-service.js';

export async function dataRoutes(app: FastifyInstance) {
  const dataService = new DataService(app.runtime);
  const chartService = new ChartService(app.runtime);

  // BE-014: Timeline 只读路由
  app.get<{
    Params: { profileId: string };
    Querystring: { timeframe?: string; startDate?: string; endDate?: string };
  }>('/profiles/:profileId/timeline', async (request, reply) => {
    const { profileId } = request.params;
    const timeframe = (request.query.timeframe ?? 'week') as Timeframe;

    const parsedTimeframe = TimeframeSchema.safeParse(timeframe);
    if (!parsedTimeframe.success) {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid timeframe', buildMeta(request)),
      );
    }

    const customDateRange = resolveCustomDateRange(parsedTimeframe.data, request.query.startDate, request.query.endDate);
    if (parsedTimeframe.data === 'custom' && !customDateRange) {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'timeframe=custom requires both startDate and endDate', buildMeta(request)),
      );
    }

    try {
      const data = dataService.getTimelineData(profileId, parsedTimeframe.data, customDateRange);
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

    const customDateRange = resolveCustomDateRange(parsedTimeframe.data, request.query.startDate, request.query.endDate);
    if (parsedTimeframe.data === 'custom' && !customDateRange) {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'timeframe=custom requires both startDate and endDate', buildMeta(request)),
      );
    }

    try {
      const data = dataService.getDataCenterData(profileId, parsedTab.data, parsedTimeframe.data, customDateRange);
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

    const parsedTimeframe = TimeframeSchema.safeParse(timeframe);
    if (!parsedTimeframe.success) {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid timeframe', buildMeta(request)),
      );
    }

    const customDateRange = resolveCustomDateRange(parsedTimeframe.data, request.query.startDate, request.query.endDate);
    if (parsedTimeframe.data === 'custom' && !customDateRange) {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'timeframe=custom requires both startDate and endDate', buildMeta(request)),
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
      const data = chartService.getChartData(profileId, validTokens, parsedTimeframe.data, customDateRange);
      return createSuccessResponse(data, buildMeta(request));
    } catch {
      return reply.status(404).send(
        createErrorResponse(ErrorCode.PROFILE_NOT_FOUND, `Profile ${profileId} not found`, buildMeta(request)),
      );
    }
  });
}

/** 解析自定义日期范围，仅当 startDate 和 endDate 同时存在时返回 */
function resolveCustomDateRange(
  timeframe: Timeframe,
  startDate?: string,
  endDate?: string,
): { start: string; end: string } | undefined {
  if (timeframe !== 'custom') return undefined;
  if (startDate && endDate) return { start: startDate, end: endDate };
  return undefined;
}
