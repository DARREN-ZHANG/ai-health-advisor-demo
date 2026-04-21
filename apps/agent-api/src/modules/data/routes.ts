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

  app.get<{
    Params: { profileId: string };
  }>('/profiles/:profileId/device-sync', async (request, reply) => {
    const { profileId } = request.params;

    try {
      const data = dataService.getDeviceSyncOverview(profileId);
      return createSuccessResponse(data, buildMeta(request));
    } catch {
      return reply.status(404).send(
        createErrorResponse(ErrorCode.PROFILE_NOT_FOUND, `Profile ${profileId} not found`, buildMeta(request)),
      );
    }
  });

  app.get<{
    Params: { profileId: string };
    Querystring: { scope?: string; syncId?: string; limit?: string };
  }>('/profiles/:profileId/device-sync/samples', async (request, reply) => {
    const { profileId } = request.params;
    const rawScope = request.query.scope ?? 'sync-session';
    const limit = request.query.limit ? Number.parseInt(request.query.limit, 10) : undefined;

    if (rawScope !== 'pending' && rawScope !== 'sync-session') {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'scope must be "pending" or "sync-session"', buildMeta(request)),
      );
    }

    const scope = rawScope;

    if (scope === 'sync-session' && !request.query.syncId) {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'scope=sync-session requires syncId', buildMeta(request)),
      );
    }

    if (request.query.limit && Number.isNaN(limit)) {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'limit must be a number', buildMeta(request)),
      );
    }

    try {
      const data = dataService.getDeviceSyncSamples(profileId, scope, request.query.syncId, limit);
      return createSuccessResponse(data, buildMeta(request));
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.startsWith('Sync session not found:')) {
        return reply.status(404).send(
          createErrorResponse(ErrorCode.NOT_FOUND, message, buildMeta(request)),
        );
      }

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
