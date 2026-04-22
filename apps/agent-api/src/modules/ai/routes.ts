import type { FastifyInstance } from 'fastify';
import { createSuccessResponse, createErrorResponse, ErrorCode, AgentTaskType, PageContextSchema } from '@health-advisor/shared';
import type { PageContext, DataTab, Timeframe } from '@health-advisor/shared';
import { AgentRequestSchema } from '@health-advisor/agent-core';
import { buildMeta } from '../../utils/meta.js';
import { AiOrchestrator } from '../../services/ai-orchestrator.js';
import { BriefCache } from '../../services/brief-cache.js';
import type { AiRequestMeta } from '../../plugins/request-context.js';

interface MorningBriefBody {
  profileId: string;
  pageContext: PageContext;
  bustCache?: boolean;
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
  const briefCache = new BriefCache();
  const orchestrator = new AiOrchestrator({
    registry: app.runtime,
    metrics: app.metrics,
    timeoutMs: app.config.AI_TIMEOUT_MS,
    briefCache,
  });

  /** 将 AI 结果元数据附加到请求上下文，供 onResponse 日志使用 */
  function attachAiLogMeta(
    request: { ctx: { aiMeta?: AiRequestMeta } },
    finishReason: string,
  ) {
    request.ctx.aiMeta = {
      provider: app.config.LLM_PROVIDER,
      model: app.config.LLM_MODEL,
      finishReason,
      fallbackTriggered: finishReason === 'fallback' || finishReason === 'timeout',
    };
  }

  // BE-018: /ai/morning-brief
  app.post<{ Body: MorningBriefBody }>('/ai/morning-brief', async (request, reply) => {
    const { profileId, pageContext, bustCache } = request.body;

    // 手动刷新时清除该 profile 的当日缓存，确保调用 LLM
    if (bustCache) {
      briefCache.invalidate(profileId);
    }

    // 后端隐式触发 app_open 同步：将 pending 事件同步到已同步状态，
    // 确保首页晨间简报基于最新已同步数据生成
    const pendingEvents = app.runtime.overrideStore.getPendingEvents(profileId);
    if (pendingEvents.length > 0) {
      app.runtime.overrideStore.performSync(profileId, 'app_open');
      // 同步后刷新 brief 缓存，避免返回过期的缓存结果
      briefCache.invalidate(profileId);
    }

    const parsed = PageContextSchema.safeParse(pageContext);
    if (!parsed.success) {
      return reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid pageContext', buildMeta(request)),
      );
    }

    const agentRequest = {
      requestId: request.ctx.requestId,
      sessionId: request.ctx.sessionId,
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
    attachAiLogMeta(request, result.meta.finishReason);
    return createSuccessResponse(attachSessionMeta(result, request.ctx.sessionId), buildMeta(request));
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
      sessionId: request.ctx.sessionId,
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
    attachAiLogMeta(request, result.meta.finishReason);
    return createSuccessResponse(attachSessionMeta(result, request.ctx.sessionId), buildMeta(request));
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
      sessionId: request.ctx.sessionId,
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
    attachAiLogMeta(request, result.meta.finishReason);
    return createSuccessResponse(attachSessionMeta(result, request.ctx.sessionId), buildMeta(request));
  });
}

function attachSessionMeta(result: Awaited<ReturnType<AiOrchestrator['execute']>>, sessionId?: string) {
  return {
    ...result,
    meta: {
      ...result.meta,
      ...(sessionId ? { sessionId } : {}),
    },
  };
}
