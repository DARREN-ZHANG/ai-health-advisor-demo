import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createErrorResponse,
  createSuccessResponse,
  ErrorCode,
  PlanDraftInputSchema,
  PlanTaskUpdateRequestSchema,
} from '@health-advisor/shared';
import { buildMeta } from '../../utils/meta.js';
import { PlanService, PlanStoreError } from './service.js';

interface SessionProfileParams {
  sessionId: string;
  profileId: string;
}

interface DraftParams extends SessionProfileParams {
  draftId: string;
}

interface GroupTaskParams extends SessionProfileParams {
  planId: string;
  groupId: string;
  taskId: string;
}

interface ExecuteDraftBody {
  confirmReplace?: boolean;
}

/**
 * Plan 模块 HTTP 路由。
 *
 * 设计要点：
 * - sessionId / profileId 都在 URL path 中，按 plan-store 隔离键直接落盘。
 * - draftId / planId 也走 URL，避免 body 漂移。
 * - 所有错误经 mapPlanStoreError → 标准 ApiResponse 错误结构。
 * - 严格 schema 校验：非法 body 整体 400，不做启发式修复。
 */
export async function planRoutes(app: FastifyInstance) {
  const service = new PlanService(app.runtime);

  /** 保存新草稿（chat route 内部也调用此 service，但本 endpoint 供测试与显式调用）。 */
  app.post<{ Params: SessionProfileParams }>('/sessions/:sessionId/profiles/:profileId/plans/draft', async (request, reply) => {
    const { sessionId, profileId } = request.params;
    const parsed = PlanDraftInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          parsed.error.issues.map((i) => i.message).join('; '),
          buildMeta(request),
        ),
      );
    }
    const draft = service.saveDraft(sessionId, profileId, parsed.data);
    return createSuccessResponse(draft, buildMeta(request));
  });

  /** 执行草稿，转为持久化 Plan。 */
  app.post<{ Params: DraftParams; Body?: ExecuteDraftBody }>(
    '/sessions/:sessionId/profiles/:profileId/plans/drafts/:draftId/execute',
    async (request, reply) => {
      const { sessionId, profileId, draftId } = request.params;
      const body = request.body ?? {};
      const confirmReplace = typeof body.confirmReplace === 'boolean' ? body.confirmReplace : false;

      try {
        const plan = service.executeDraft(sessionId, profileId, draftId, confirmReplace);
        return createSuccessResponse(plan, buildMeta(request));
      } catch (error) {
        return sendPlanStoreError(error, request, reply);
      }
    },
  );

  /** 取当前计划；不存在返回 null。 */
  app.get<{ Params: SessionProfileParams }>(
    '/sessions/:sessionId/profiles/:profileId/plans/current',
    async (request) => {
      const { sessionId, profileId } = request.params;
      const plan = service.getCurrentPlan(sessionId, profileId);
      return createSuccessResponse(plan, buildMeta(request));
    },
  );

  /** 原子更新任务完成状态。 */
  app.patch<{ Params: GroupTaskParams }>(
    '/sessions/:sessionId/profiles/:profileId/plans/:planId/groups/:groupId/tasks/:taskId',
    async (request, reply) => {
      const { sessionId, profileId, groupId, taskId } = request.params;
      const parsed = PlanTaskUpdateRequestSchema.safeParse(request.body);
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
        const plan = service.updateTask(
          sessionId,
          profileId,
          groupId,
          taskId,
          parsed.data.expectedVersion,
          parsed.data.completed,
        );
        return createSuccessResponse(plan, buildMeta(request));
      } catch (error) {
        return sendPlanStoreError(error, request, reply);
      }
    },
  );

  /** 结束并清除当前计划。 */
  app.delete<{ Params: SessionProfileParams }>(
    '/sessions/:sessionId/profiles/:profileId/plans/current',
    async (request) => {
      const { sessionId, profileId } = request.params;
      service.endPlan(sessionId, profileId);
      return createSuccessResponse({ ended: true }, buildMeta(request));
    },
  );
}

/**
 * 把 plan-store 错误映射到 HTTP 状态码与 ErrorCode。
 * - DRAFT_NOT_FOUND / DRAFT_REVOKED / PLAN_NOT_FOUND → 404
 * - REPLACE_NOT_CONFIRMED → 409
 * - VERSION_MISMATCH → 409
 * - 未知错误 → 500
 */
function sendPlanStoreError(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof PlanStoreError) {
    if (error.code === 'REPLACE_NOT_CONFIRMED' || error.code === 'VERSION_MISMATCH') {
      return reply.status(409).send(
        createErrorResponse(ErrorCode.CONFLICT, error.message, buildMeta(request)),
      );
    }
    return reply.status(404).send(
      createErrorResponse(ErrorCode.NOT_FOUND, error.message, buildMeta(request)),
    );
  }
  request.log.error({ err: error }, 'plan route unexpected error');
  return reply.status(500).send(
    createErrorResponse(ErrorCode.UNKNOWN, 'Unexpected plan error', buildMeta(request)),
  );
}
