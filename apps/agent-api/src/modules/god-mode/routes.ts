import type { FastifyInstance } from 'fastify';
import {
  createSuccessResponse,
  createErrorResponse,
  ErrorCode,
  ProfileSwitchPayloadSchema,
  EventInjectPayloadSchema,
  MetricOverridePayloadSchema,
  ResetPayloadSchema,
  TimelineAppendPayloadSchema,
  SyncTriggerPayloadSchema,
  AdvanceClockPayloadSchema,
  ResetProfileTimelinePayloadSchema,
  UpdateProfileRequestSchema,
  CloneProfileRequestSchema,
} from '@health-advisor/shared';
import type { EventInjectPayload, MetricOverridePayload, ResetPayload, UpdateProfilePayload, CloneProfilePayload } from '@health-advisor/shared';
import { buildMeta } from '../../utils/meta.js';
import { GodModeService } from './service.js';

interface SwitchProfileBody {
  profileId: string;
}

interface InjectEventBody {
  profileId?: string;
  eventType: string;
  data: Record<string, unknown>;
  timestamp?: string;
}

interface OverrideMetricBody {
  profileId?: string;
  metric: string;
  value: unknown;
  dateRange?: { start: string; end: string };
}

interface ResetBody {
  scope: 'profile' | 'events' | 'overrides' | 'all';
}

interface UpdateProfileBody {
  name?: string;
  age?: number;
  gender?: 'male' | 'female';
  avatar?: string;
  tags?: string[];
  baseline?: {
    restingHr?: number;
    hrv?: number;
    spo2?: number;
    avgSleepMinutes?: number;
    avgSteps?: number;
  };
  weeklyBaseline?: {
    restingHr?: number;
    hrv?: number;
    spo2?: number;
    avgSleepMinutes?: number;
    avgSteps?: number;
  };
  dailyBaseline?: {
    restingHr?: number;
    hrv?: number;
    spo2?: number;
    avgSleepMinutes?: number;
    avgSteps?: number;
  };
}

interface CloneProfileBody {
  sourceProfileId: string;
  newProfileId: string;
  overrides?: Record<string, unknown>;
}

/** 概率事件类型：注入这些事件时不应触发简报缓存失效，
 *  只有用户确认（追加 timeline）后才更新简报 */
const PROBABILISTIC_EVENT_TYPES = new Set([
  'possible_alcohol_intake',
  'possible_caffeine_intake',
  'probabilistic_dismissed',
]);

export async function godModeRoutes(app: FastifyInstance) {
  const service = new GodModeService(app.runtime);
  const invalidateBriefCache = () => {
    app.briefCache.clearAll();
  };

  // BE-022: /god-mode/switch-profile
  app.post<{ Body: SwitchProfileBody }>('/god-mode/switch-profile', async (request, reply) => {
    const parsed = ProfileSwitchPayloadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, parsed.error.issues.map((i) => i.message).join('; '), buildMeta(request)),
      );
    }

    try {
      const result = service.switchProfile(parsed.data.profileId, request.ctx?.sessionId);
      return createSuccessResponse(result, buildMeta(request));
    } catch {
      return reply.status(404).send(
        createErrorResponse(ErrorCode.PROFILE_NOT_FOUND, `Profile '${parsed.data.profileId}' not found`, buildMeta(request)),
      );
    }
  });

  // BE-023: /god-mode/inject-event
  app.post<{ Body: InjectEventBody }>('/god-mode/inject-event', async (request, reply) => {
    const { profileId, ...payload } = request.body;

    const parsed = EventInjectPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, parsed.error.issues.map((i) => i.message).join('; '), buildMeta(request)),
      );
    }

    const targetProfileId = profileId ?? app.runtime.overrideStore.getCurrentProfileId();
    const result = service.injectEvent(targetProfileId, parsed.data as EventInjectPayload, request.ctx?.sessionId);
    // 概率事件在用户确认前不应触发简报更新
    if (!PROBABILISTIC_EVENT_TYPES.has(parsed.data.eventType)) {
      invalidateBriefCache();
    }
    return createSuccessResponse(result, buildMeta(request));
  });

  // BE-024: /god-mode/override-metric
  app.post<{ Body: OverrideMetricBody }>('/god-mode/override-metric', async (request, reply) => {
    const { profileId, ...payload } = request.body;

    const parsed = MetricOverridePayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, parsed.error.issues.map((i) => i.message).join('; '), buildMeta(request)),
      );
    }

    const targetProfileId = profileId ?? app.runtime.overrideStore.getCurrentProfileId();
    const result = service.overrideMetric(targetProfileId, parsed.data as MetricOverridePayload, request.ctx?.sessionId);
    invalidateBriefCache();
    return createSuccessResponse(result, buildMeta(request));
  });

  // BE-025: /god-mode/reset
  app.post<{ Body: ResetBody }>('/god-mode/reset', async (request, reply) => {
    const parsed = ResetPayloadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, parsed.error.issues.map((i) => i.message).join('; '), buildMeta(request)),
      );
    }

    const result = service.reset(parsed.data as ResetPayload, request.ctx?.sessionId);
    invalidateBriefCache();
    return createSuccessResponse(result, buildMeta(request));
  });

  // BE-025A: /god-mode/state
  app.get('/god-mode/state', async (request) => {
    const state = service.getState();
    return createSuccessResponse(state, buildMeta(request));
  });

  // 时间轴追加片段
  app.post('/god-mode/timeline-append', async (request, reply) => {
    const parsed = TimelineAppendPayloadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, parsed.error.issues.map((i) => i.message).join('; '), buildMeta(request)),
      );
    }

    const result = service.appendToTimeline(
      parsed.data.segmentType,
      parsed.data.params,
      parsed.data.offsetMinutes,
      request.ctx?.sessionId,
      {
        durationMinutes: parsed.data.durationMinutes,
        advanceClock: parsed.data.advanceClock,
      },
    );
    invalidateBriefCache();
    return createSuccessResponse(result, buildMeta(request));
  });

  // 触发同步
  app.post('/god-mode/sync-trigger', async (request, reply) => {
    const parsed = SyncTriggerPayloadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, parsed.error.issues.map((i) => i.message).join('; '), buildMeta(request)),
      );
    }

    const result = service.triggerSync(parsed.data.trigger, request.ctx?.sessionId);
    invalidateBriefCache();
    return createSuccessResponse(result, buildMeta(request));
  });

  // 推进时钟
  app.post('/god-mode/advance-clock', async (request, reply) => {
    const parsed = AdvanceClockPayloadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, parsed.error.issues.map((i) => i.message).join('; '), buildMeta(request)),
      );
    }

    const result = service.advanceClock(parsed.data.minutes);
    invalidateBriefCache();
    return createSuccessResponse(result, buildMeta(request));
  });

  // 重置时间轴
  app.post('/god-mode/reset-profile-timeline', async (request, reply) => {
    const parsed = ResetProfileTimelinePayloadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, parsed.error.issues.map((i) => i.message).join('; '), buildMeta(request)),
      );
    }

    const result = service.resetProfileTimeline(parsed.data.profileId, request.ctx?.sessionId);
    invalidateBriefCache();
    return createSuccessResponse(result, buildMeta(request));
  });

  // 一键校准演示数据：以当前真实日期为演示日，重新生成 31 天历史
  app.post('/god-mode/recalibrate', async (request) => {
    const result = service.recalibrate(request.ctx?.sessionId);
    invalidateBriefCache();
    return createSuccessResponse(result, buildMeta(request));
  });

  // Profile CRUD: 更新 profile 字段
  app.put<{ Params: { profileId: string }; Body: UpdateProfileBody }>(
    '/god-mode/profiles/:profileId',
    async (request, reply) => {
      const parsed = UpdateProfileRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            parsed.error.issues.map((i) => i.message).join('; '),
            buildMeta(request),
          ),
        );
      }

      try {
        const result = service.updateProfile(request.params.profileId, parsed.data as UpdateProfilePayload);
        invalidateBriefCache();
        return createSuccessResponse(result, buildMeta(request));
      } catch (error) {
        const statusCode = (error as unknown as { statusCode?: number }).statusCode ?? 500;
        const message = error instanceof Error ? error.message : 'Unknown error';
        const code =
          statusCode === 422 ? ErrorCode.VALIDATION_ERROR
          : statusCode === 404 ? ErrorCode.PROFILE_NOT_FOUND
          : ErrorCode.UNKNOWN;
        return reply.status(statusCode).send(createErrorResponse(code, message, buildMeta(request)));
      }
    },
  );

  // Profile CRUD: 克隆创建新 profile
  app.post<{ Body: CloneProfileBody }>('/god-mode/profiles', async (request, reply) => {
    const parsed = CloneProfileRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          parsed.error.issues.map((i) => i.message).join('; '),
          buildMeta(request),
        ),
      );
    }

    try {
      const result = service.cloneProfile(
        parsed.data.sourceProfileId,
        parsed.data.newProfileId,
        parsed.data.overrides as CloneProfilePayload['overrides'],
      );
      invalidateBriefCache();
      return createSuccessResponse(result, buildMeta(request));
    } catch (error) {
      const statusCode = (error as unknown as { statusCode?: number }).statusCode ?? 500;
      const message = error instanceof Error ? error.message : 'Unknown error';
      const code =
        statusCode === 409 ? ErrorCode.CONFLICT
        : statusCode === 404 ? ErrorCode.PROFILE_NOT_FOUND
        : ErrorCode.UNKNOWN;
      return reply.status(statusCode).send(createErrorResponse(code, message, buildMeta(request)));
    }
  });

  // Profile CRUD: 删除 profile
  app.delete<{ Params: { profileId: string } }>(
    '/god-mode/profiles/:profileId',
    async (request, reply) => {
      try {
        const result = service.deleteProfile(request.params.profileId);
        invalidateBriefCache();
        return createSuccessResponse(result, buildMeta(request));
      } catch (error) {
        const statusCode = (error as unknown as { statusCode?: number }).statusCode ?? 500;
        const message = error instanceof Error ? error.message : 'Unknown error';
        const code =
          statusCode === 400 ? ErrorCode.VALIDATION_ERROR
          : statusCode === 404 ? ErrorCode.PROFILE_NOT_FOUND
          : ErrorCode.UNKNOWN;
        return reply.status(statusCode).send(createErrorResponse(code, message, buildMeta(request)));
      }
    },
  );

  // Profile CRUD: 恢复 profile 到原始模板
  app.post<{ Params: { profileId: string } }>(
    '/god-mode/profiles/:profileId/reset',
    async (request, reply) => {
      try {
        const result = service.resetProfile(request.params.profileId);
        invalidateBriefCache();
        return createSuccessResponse(result, buildMeta(request));
      } catch (error) {
        const statusCode = (error as unknown as { statusCode?: number }).statusCode ?? 500;
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.status(statusCode).send(
          createErrorResponse(
            statusCode === 404 ? ErrorCode.PROFILE_NOT_FOUND : ErrorCode.UNKNOWN,
            message,
            buildMeta(request),
          ),
        );
      }
    },
  );
}
