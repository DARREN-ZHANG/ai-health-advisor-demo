import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  createSuccessResponse,
  createErrorResponse,
  ErrorCode,
  AgentTaskType,
  PageContextSchema,
  ActionOptionSchema,
  FutureSuggestionSchema,
} from '@health-advisor/shared';
import type { PageContext, DataTab, Timeframe } from '@health-advisor/shared';
import { AgentRequestSchema, type AgentRequest } from '@health-advisor/agent-core';
import { buildMeta } from '../../utils/meta.js';
import { AiOrchestrator, type AiExecutionTimings } from '../../services/ai-orchestrator.js';
import type { AiRequestMeta } from '../../plugins/request-context.js';
import { SseWriter } from '../../utils/sse-writer.js';
import { resolveCorsHeaders } from '../../plugins/cors.js';

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

/**
 * morning brief 准备阶段的共享 helper。
 *
 * 把 JSON route 与 SSE route 共用的逻辑抽到一处，避免两边漂移：
 * 1. bustCache 手动刷新
 * 2. 后端隐式 app_open 同步（pending 事件 → 同步 → 刷新缓存）
 * 3. PageContextSchema 校验
 * 4. AgentRequest 构建 + AgentRequestSchema 校验
 *
 * 成功返回 `{ success: true, data: AgentRequest }`；校验失败时 helper 内部已
 * reply 400 JSON，返回 `{ success: false, sent: true }`，调用方据此 return。
 */
type PrepareResult =
  | { success: true; data: AgentRequest }
  | { success: false; sent: true };

export async function aiRoutes(app: FastifyInstance) {
  const orchestrator = new AiOrchestrator({
    registry: app.runtime,
    metrics: app.metrics,
    timeoutMs: app.config.AI_TIMEOUT_MS,
    memoryServices: app.memoryServices,
    modelVersion: app.config.LLM_MODEL,
  });

  /** 将 AI 结果元数据附加到请求上下文，供 onResponse 日志使用 */
  function attachAiLogMeta(
    request: { ctx: { aiMeta?: AiRequestMeta } },
    finishReason: string,
    timings?: AiExecutionTimings,
  ) {
    request.ctx.aiMeta = {
      provider: app.config.LLM_PROVIDER,
      model: app.config.LLM_MODEL,
      finishReason,
      fallbackTriggered: finishReason === 'fallback' || finishReason === 'timeout',
      ...(timings ? { timings } : {}),
    };
  }

  /** morning brief 准备 helper（bustCache + app_open sync + 校验 + AgentRequest 构建） */
  async function prepareMorningBriefRequest(
    request: FastifyRequest<{ Body: MorningBriefBody }>,
    reply: FastifyReply,
  ): Promise<PrepareResult> {
    const { profileId, pageContext, bustCache } = request.body;

    // 手动刷新时清除该 profile 的当日缓存，确保调用 LLM
    if (bustCache) {
      await app.memoryServices.cache.invalidateProfile({ profileId });
    }

    // 后端隐式触发 app_open 同步：将 pending 事件同步到已同步状态，
    // 确保首页晨间简报基于最新已同步数据生成
    const overrideStore = app.runtime.getSessionSandbox(request.ctx.sessionId).overrideStore;
    const pendingEvents = overrideStore.getPendingEvents(profileId);
    if (pendingEvents.length > 0) {
      overrideStore.performSync(profileId, 'app_open');
      // 同步后刷新 brief 缓存，避免返回过期的缓存结果
      await app.memoryServices.cache.invalidateProfile({ profileId });
    }

    const parsed = PageContextSchema.safeParse(pageContext);
    if (!parsed.success) {
      reply.status(400).send(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid pageContext', buildMeta(request)),
      );
      return { success: false, sent: true };
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
      reply.status(400).send(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          parseResult.error.issues.map((i) => i.message).join('; '),
          buildMeta(request),
        ),
      );
      return { success: false, sent: true };
    }

    return { success: true, data: parseResult.data };
  }

  // BE-018: /ai/morning-brief
  app.post<{ Body: MorningBriefBody }>('/ai/morning-brief', async (request, reply) => {
    const routeStartedAt = performance.now();

    const prepared = await prepareMorningBriefRequest(request, reply);
    if (!prepared.success) {
      return;
    }

    const orchestrationStartedAt = performance.now();
    let timings: AiExecutionTimings | undefined;
    const result = await orchestrator.execute(prepared.data, request.lang, {
      onTimings: (value) => {
        timings = {
          ...value,
          routePreparationMs: Math.round(orchestrationStartedAt - routeStartedAt),
        };
      },
    });
    attachAiLogMeta(request, result.meta.finishReason, timings);
    return createSuccessResponse(
      attachSessionMeta(result, request.ctx.sessionId),
      buildMeta(request),
    );
  });

  // BE-018-STREAM: /ai/morning-brief/stream
  // 把 runtime delta 翻译成稳定的 BriefStreamEvent SSE 帧，保持缓存、日志、
  // session 和断连取消一致。cache hit 直接发 completed（无 delta）；cache miss
  // 透传 onSummaryDelta 推送 delta；任何失败路径（异常/非 complete/parse error）
  // 发 failed 且不得再发 completed。
  app.post<{ Body: MorningBriefBody }>('/ai/morning-brief/stream', async (request, reply) => {
    const routeStartedAt = performance.now();

    // 1. 校验 + sync + cache bust（共享 helper）。校验失败返回 400 JSON（非 SSE）。
    const prepared = await prepareMorningBriefRequest(request, reply);
    if (!prepared.success) {
      return;
    }

    // 2. hijack reply：完全接管 reply.raw，Fastify 不再处理 payload。
    //    注意：hijack 后 onSend hook 不触发，但 onResponse 仍触发（已验证）。
    //    因此 X-Session-Id 必须在 startSseHeaders 中显式写入。
    reply.hijack();

    const writer = new SseWriter({ reply, requestId: request.ctx.requestId });
    // hijack 后 @fastify/cors 的 onSend hook 不触发，手动注入 CORS headers，
    // 复用与普通 JSON route 相同的白名单逻辑（resolveCorsHeaders）。
    const corsHeaders = resolveCorsHeaders(
      request.headers.origin as string | undefined,
      app.config,
    );
    writer.startSseHeaders(request.ctx.sessionId, corsHeaders);

    // 3. 监听断连：request.raw 的 'aborted' + reply.raw 的 'close'。
    //    仅在尚未发送终态且 response 未结束时 abort runtime，避免 abort 一个
    //    已完成的请求（产生无意义的下游取消）。
    const abortController = new AbortController();
    const onDisconnect = () => {
      if (!writer.hasTerminal && !reply.raw.writableEnded) {
        abortController.abort();
      }
    };
    request.raw.on('aborted', onDisconnect);
    reply.raw.on('close', onDisconnect);

    // 4. 写 started 帧
    await writer.writeEvent({ type: 'brief.started', requestId: request.ctx.requestId });

    // 5. 执行：透传 signal 与 onSummaryDelta。
    //    onSummaryDelta 仅在 writer 未关闭时写入（防止 close 后写入）。
    const orchestrationStartedAt = performance.now();
    let timings: AiExecutionTimings | undefined;
    let result: Awaited<ReturnType<AiOrchestrator['execute']>> | undefined;
    let finishReasonForLog = 'fallback';

    try {
      result = await orchestrator.execute(prepared.data, request.lang, {
        signal: abortController.signal,
        onSummaryDelta: async (delta) => {
          if (!writer.isClosed) {
            await writer.writeEvent({
              type: 'brief.summary.delta',
              requestId: request.ctx.requestId,
              delta,
            });
          }
        },
        // 单元素 safeParse：对每个 action/suggestion 独立校验，非法元素记 warn 跳过，
        // 不让一个坏元素中断整条流。与 onSummaryDelta 对称，写帧前检查 writer.isClosed。
        onActionReady: async (index, action) => {
          if (writer.isClosed) return;
          const parsed = ActionOptionSchema.safeParse(action);
          if (!parsed.success) {
            app.log.warn(
              { requestId: request.ctx.requestId, index, issues: parsed.error.issues },
              'action.ready 元素校验失败，跳过',
            );
            return;
          }
          await writer.writeEvent({
            type: 'brief.action.ready',
            requestId: request.ctx.requestId,
            index,
            action: parsed.data,
          });
        },
        onForecastStarted: async () => {
          if (!writer.isClosed) {
            await writer.writeEvent({
              type: 'brief.forecast.started',
              requestId: request.ctx.requestId,
            });
          }
        },
        onFutureSuggestionReady: async (index, suggestion) => {
          if (writer.isClosed) return;
          const parsed = FutureSuggestionSchema.safeParse(suggestion);
          if (!parsed.success) {
            app.log.warn(
              { requestId: request.ctx.requestId, index, issues: parsed.error.issues },
              'future_suggestion.ready 元素校验失败，跳过',
            );
            return;
          }
          await writer.writeEvent({
            type: 'brief.future_suggestion.ready',
            requestId: request.ctx.requestId,
            index,
            suggestion: parsed.data,
          });
        },
        onTimings: (value) => {
          timings = {
            ...value,
            routePreparationMs: Math.round(orchestrationStartedAt - routeStartedAt),
          };
        },
      });

      finishReasonForLog = result.meta.finishReason;

      // 6. 终态：complete 或 cached 都视为成功（发 completed）；
      //    其他（fallback/timeout）发 failed。
      //    cache hit 的 finishReason 是 'cached'，meta 保留 cached。
      //
      //    关键：必须在 writeTerminal 之前设置 aiMeta。writeTerminal 内部调用
      //    reply.raw.end()，会触发 Fastify 的 onResponse hook（已验证 hijack 后
      //    onResponse 仍执行），hook 会读取 request.ctx.aiMeta 记录 "request
      //    completed" 日志。若在 writeTerminal 之后设置 aiMeta，onResponse 已
      //    在 end() 时触发，日志会缺失 provider/model/timings 字段。
      attachAiLogMeta(request, finishReasonForLog, timings);

      if (result.meta.finishReason === 'complete' || result.meta.finishReason === 'cached') {
        await writer.writeTerminal({
          type: 'brief.completed',
          requestId: request.ctx.requestId,
          response: result,
        });
      } else {
        await writer.writeTerminal({
          type: 'brief.failed',
          requestId: request.ctx.requestId,
          error: {
            code: 'BRIEF_GENERATION_FAILED',
            message: '实时简报生成失败',
          },
        });
      }
    } catch {
      // provider error / abort / streaming parse error：发 failed terminal。
      // exactly-one-terminal guard：若 writer 已发过 terminal（不应发生，但防御），
      // 则跳过。
      finishReasonForLog = 'fallback';
      // 异常路径也要在 writeTerminal 之前设置 aiMeta（理由同上）
      attachAiLogMeta(request, finishReasonForLog, timings);
      if (!writer.hasTerminal) {
        await writer.writeTerminal({
          type: 'brief.failed',
          requestId: request.ctx.requestId,
          error: {
            code: 'BRIEF_GENERATION_FAILED',
            message: '实时简报生成失败',
          },
        });
      }
    } finally {
      request.raw.off('aborted', onDisconnect);
      reply.raw.off('close', onDisconnect);
      // 确保流已关闭（异常路径若未走到 writeTerminal 则 close）
      if (!writer.isClosed) {
        writer.close();
      }
    }
  });

  // BE-019: /ai/view-summary
  app.post<{ Body: ViewSummaryBody }>('/ai/view-summary', async (request, reply) => {
    const routeStartedAt = performance.now();
    const { profileId, pageContext, tab, timeframe } = request.body;

    const parsed = PageContextSchema.safeParse(pageContext);
    if (!parsed.success) {
      return reply
        .status(400)
        .send(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            'Invalid pageContext',
            buildMeta(request),
          ),
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
      return reply
        .status(400)
        .send(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            parseResult.error.issues.map((i) => i.message).join('; '),
            buildMeta(request),
          ),
        );
    }

    const orchestrationStartedAt = performance.now();
    let timings: AiExecutionTimings | undefined;
    const result = await orchestrator.execute(parseResult.data, request.lang, {
      onTimings: (value) => {
        timings = {
          ...value,
          routePreparationMs: Math.round(orchestrationStartedAt - routeStartedAt),
        };
      },
    });
    attachAiLogMeta(request, result.meta.finishReason, timings);
    return createSuccessResponse(
      attachSessionMeta(result, request.ctx.sessionId),
      buildMeta(request),
    );
  });

  // BE-020: /ai/chat
  app.post<{ Body: ChatBody }>('/ai/chat', async (request, reply) => {
    const routeStartedAt = performance.now();
    const { profileId, pageContext, userMessage, smartPromptId, visibleChartIds } = request.body;

    if (!userMessage || typeof userMessage !== 'string') {
      return reply
        .status(400)
        .send(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            'userMessage is required',
            buildMeta(request),
          ),
        );
    }

    const parsed = PageContextSchema.safeParse(pageContext);
    if (!parsed.success) {
      return reply
        .status(400)
        .send(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            'Invalid pageContext',
            buildMeta(request),
          ),
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
      return reply
        .status(400)
        .send(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            parseResult.error.issues.map((i) => i.message).join('; '),
            buildMeta(request),
          ),
        );
    }

    const orchestrationStartedAt = performance.now();
    let timings: AiExecutionTimings | undefined;
    const result = await orchestrator.execute(parseResult.data, request.lang, {
      onTimings: (value) => {
        timings = {
          ...value,
          routePreparationMs: Math.round(orchestrationStartedAt - routeStartedAt),
        };
      },
    });
    attachAiLogMeta(request, result.meta.finishReason, timings);

    const memoryCandidates = [];

    if (app.memoryServices.extractor && parseResult.data.userMessage) {
      const extraction = await app.memoryServices.extractor.extract({
        userMessage: parseResult.data.userMessage,
        profileId,
        sessionId: request.ctx.sessionId!,
      });

      for (const extracted of extraction.candidates) {
        const now = Date.now();
        const candidate = await app.memoryServices.candidates.saveCandidate({
          id: randomUUID(),
          userScopeId: app.memoryServices.userScopeId,
          profileId,
          sessionId: request.ctx.sessionId!,
          sourceMessageId: request.ctx.requestId,
          kind: extracted.kind as import('@health-advisor/agent-core').MemoryKind,
          canonicalKey: extracted.canonicalKey,
          payload: extracted.payload,
          evidenceQuote: extracted.evidenceQuote,
          confidence: extracted.confidence,
          proposedConfirmationText: extracted.proposedConfirmationText,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
          expiresAt: now + app.memoryServices.candidateTtlMs,
        });

        memoryCandidates.push({
          id: candidate.id,
          kind: candidate.kind,
          proposedConfirmationText: candidate.proposedConfirmationText,
          evidenceQuote: candidate.evidenceQuote,
        });
      }
    }

    return createSuccessResponse(
      attachSessionMeta(
        { ...result, ...(memoryCandidates.length > 0 ? { memoryCandidates } : {}) },
        request.ctx.sessionId,
      ),
      buildMeta(request),
    );
  });
}

function attachSessionMeta(
  result: Awaited<ReturnType<AiOrchestrator['execute']>>,
  sessionId?: string,
) {
  return {
    ...result,
    meta: {
      ...result.meta,
      ...(sessionId ? { sessionId } : {}),
    },
  };
}
