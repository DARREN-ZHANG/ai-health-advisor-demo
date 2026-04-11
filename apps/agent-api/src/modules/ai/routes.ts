import type { FastifyInstance } from 'fastify';
import { createSuccessResponse, createErrorResponse, ErrorCode, AgentTaskType, PageContextSchema } from '@health-advisor/shared';
import type { ApiMeta, PageContext, DataTab, Timeframe } from '@health-advisor/shared';
import { AgentRequestSchema } from '@health-advisor/agent-core';
import { AiOrchestrator } from '../../services/ai-orchestrator.js';

function buildMeta(request: { ctx?: { requestId: string; startTime: number }; id: string }): ApiMeta {
  const startTime = request.ctx?.startTime ?? performance.now();
  return {
    timestamp: new Date().toISOString(),
    requestId: request.ctx?.requestId ?? request.id,
    durationMs: Math.round(performance.now() - startTime),
  };
}

interface MorningBriefBody {
  profileId: string;
  pageContext: PageContext;
}

interface ViewSummaryBody {
  profileId: string;
  pageContext: PageContext;
  tab?: DataTab;
  timeframe?: Timeframe;
}

interface ChatBody {
  profileId: string;
  pageContext: PageContext;
  userMessage: string;
  smartPromptId?: string;
  visibleChartIds?: string[];
}

export async function aiRoutes(app: FastifyInstance) {
  const orchestrator = new AiOrchestrator({
    registry: app.runtime,
    metrics: app.metrics,
    timeoutMs: app.config.AI_TIMEOUT_MS,
  });

  // BE-018: /ai/morning-brief
  app.post<{ Body: MorningBriefBody }>('/ai/morning-brief', async (request, reply) => {
    const { profileId, pageContext } = request.body;

    const parsed = PageContextSchema.safeParse(pageContext);
    if (!parsed.success) {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid pageContext', buildMeta(request)),
      );
    }

    const agentRequest = {
      requestId: request.ctx.requestId,
      sessionId: request.ctx.sessionId ?? `session-${Date.now()}`,
      profileId,
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: parsed.data,
    };

    const parseResult = AgentRequestSchema.safeParse(agentRequest);
    if (!parseResult.success) {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, parseResult.error.issues.map((i) => i.message).join('; '), buildMeta(request)),
      );
    }

    const result = await orchestrator.execute(parseResult.data);
    return createSuccessResponse(result, buildMeta(request));
  });

  // BE-019: /ai/view-summary
  app.post<{ Body: ViewSummaryBody }>('/ai/view-summary', async (request, reply) => {
    const { profileId, pageContext, tab, timeframe } = request.body;

    const parsed = PageContextSchema.safeParse(pageContext);
    if (!parsed.success) {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid pageContext', buildMeta(request)),
      );
    }

    const agentRequest = {
      requestId: request.ctx.requestId,
      sessionId: request.ctx.sessionId ?? `session-${Date.now()}`,
      profileId,
      taskType: AgentTaskType.VIEW_SUMMARY,
      pageContext: parsed.data,
      ...(tab ? { tab } : {}),
      ...(timeframe ? { timeframe } : {}),
    };

    const parseResult = AgentRequestSchema.safeParse(agentRequest);
    if (!parseResult.success) {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, parseResult.error.issues.map((i) => i.message).join('; '), buildMeta(request)),
      );
    }

    const result = await orchestrator.execute(parseResult.data);
    return createSuccessResponse(result, buildMeta(request));
  });

  // BE-020: /ai/chat
  app.post<{ Body: ChatBody }>('/ai/chat', async (request, reply) => {
    const { profileId, pageContext, userMessage, smartPromptId, visibleChartIds } = request.body;

    if (!userMessage || typeof userMessage !== 'string') {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'userMessage is required', buildMeta(request)),
      );
    }

    const parsed = PageContextSchema.safeParse(pageContext);
    if (!parsed.success) {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid pageContext', buildMeta(request)),
      );
    }

    const agentRequest = {
      requestId: request.ctx.requestId,
      sessionId: request.ctx.sessionId ?? `session-${Date.now()}`,
      profileId,
      taskType: AgentTaskType.ADVISOR_CHAT,
      pageContext: parsed.data,
      userMessage,
      ...(smartPromptId ? { smartPromptId } : {}),
      ...(visibleChartIds ? { visibleChartIds } : {}),
    };

    const parseResult = AgentRequestSchema.safeParse(agentRequest);
    if (!parseResult.success) {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, parseResult.error.issues.map((i) => i.message).join('; '), buildMeta(request)),
      );
    }

    const result = await orchestrator.execute(parseResult.data);
    return createSuccessResponse(result, buildMeta(request));
  });
}
