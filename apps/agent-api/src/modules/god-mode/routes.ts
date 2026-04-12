import type { FastifyInstance } from 'fastify';
import {
  createSuccessResponse,
  createErrorResponse,
  ErrorCode,
  ProfileSwitchPayloadSchema,
  EventInjectPayloadSchema,
  MetricOverridePayloadSchema,
  ResetPayloadSchema,
  ScenarioPayloadSchema,
} from '@health-advisor/shared';
import type { EventInjectPayload, MetricOverridePayload, ResetPayload } from '@health-advisor/shared';
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

interface DemoScriptRunBody {
  scenarioId: string;
}

export async function godModeRoutes(app: FastifyInstance) {
  const service = new GodModeService(app.runtime);

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
    return createSuccessResponse(result, buildMeta(request));
  });

  // BE-025A: /god-mode/state
  app.get('/god-mode/state', async (request) => {
    const state = service.getState();
    return createSuccessResponse(state, buildMeta(request));
  });

  // BE-025A: /god-mode/demo-script/run
  app.post<{ Body: DemoScriptRunBody }>('/god-mode/demo-script/run', async (request, reply) => {
    const parsed = ScenarioPayloadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, parsed.error.issues.map((i) => i.message).join('; '), buildMeta(request)),
      );
    }

    try {
      const result = service.runDemoScript(parsed.data.scenarioId, request.ctx?.sessionId);
      return createSuccessResponse(result, buildMeta(request));
    } catch (error) {
      const statusCode = (error as any).statusCode ?? 500;
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(statusCode).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, message, buildMeta(request)),
      );
    }
  });
}
