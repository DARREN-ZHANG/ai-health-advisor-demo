import { z } from 'zod';

/**
 * 计划（Plan）相关的 Zod schema。
 *
 * 校验原则：
 * - 严格 schema：任何非法或超限结构整体拒绝，不静默截断或补字段。
 * - 分组最多 30 个，每组任务最多 20 个，对齐产品决策。
 * - 草稿形态不含 id；持久化形态由服务端补 UUID。
 */

export const MAX_PLAN_GROUPS = 30;
export const MAX_PLAN_TASKS_PER_GROUP = 20;

const TITLE_MAX = 120;
const SUMMARY_MAX = 1000;
const DESCRIPTION_MAX = 500;
const TIME_OF_DAY_MAX = 40;
const ESTIMATED_MINUTES_MAX = 24 * 60;

export const PlanTaskDraftSchema = z
  .object({
    title: z.string().min(1).max(TITLE_MAX),
    description: z.string().max(DESCRIPTION_MAX).optional(),
    suggestedTimeOfDay: z.string().min(1).max(TIME_OF_DAY_MAX).optional(),
    estimatedMinutes: z.number().int().positive().max(ESTIMATED_MINUTES_MAX).optional(),
  })
  .strict();

export const PlanGroupDraftSchema = z
  .object({
    title: z.string().min(1).max(TITLE_MAX),
    tasks: z.array(PlanTaskDraftSchema).min(1).max(MAX_PLAN_TASKS_PER_GROUP),
  })
  .strict();

export const PlanDraftInputSchema = z
  .object({
    title: z.string().min(1).max(TITLE_MAX),
    summary: z.string().min(1).max(SUMMARY_MAX),
    groups: z.array(PlanGroupDraftSchema).min(1).max(MAX_PLAN_GROUPS),
  })
  .strict();

const UUID_SCHEMA = z.string().uuid();

export const PlanTaskSchema = PlanTaskDraftSchema.extend({
  id: UUID_SCHEMA,
  completed: z.boolean(),
});

export const PlanGroupSchema = PlanGroupDraftSchema.extend({
  id: UUID_SCHEMA,
  tasks: z.array(PlanTaskSchema).min(1).max(MAX_PLAN_TASKS_PER_GROUP),
});

export const PlanProgressSchema = z.object({
  totalTasks: z.number().int().nonnegative(),
  completedTasks: z.number().int().nonnegative(),
});

export const PlanStatusSchema = z.enum(['active', 'completed']);

export const PlanSchema = z
  .object({
    id: UUID_SCHEMA,
    profileId: z.string().min(1),
    sessionId: z.string().min(1),
    title: z.string().min(1).max(TITLE_MAX),
    summary: z.string().min(1).max(SUMMARY_MAX),
    groups: z.array(PlanGroupSchema).min(1).max(MAX_PLAN_GROUPS),
    status: PlanStatusSchema,
    version: z.number().int().nonnegative(),
    progress: PlanProgressSchema,
    createdAt: z.string().min(1),
    executedAt: z.string().min(1),
  })
  .strict();

export const PlanDraftSchema = z
  .object({
    draftId: UUID_SCHEMA,
    title: z.string().min(1).max(TITLE_MAX),
    summary: z.string().min(1).max(SUMMARY_MAX),
    groups: z.array(PlanGroupDraftSchema).min(1).max(MAX_PLAN_GROUPS),
    createdAt: z.string().min(1),
  })
  .strict();

/**
 * PATCH /plans/:planId/groups/:groupId/tasks/:taskId 的请求体。
 *
 * expectedVersion 必须与当前 plan.version 完全匹配，否则整体拒绝；
 * 服务端不会用启发式修复或部分合并。
 */
export const PlanTaskUpdateRequestSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    completed: z.boolean(),
  })
  .strict();

/**
 * DELETE /sessions/:sessionId/profiles/:profileId/plans/current 的查询参数。
 *
 * `confirmReplace` 仅用于"替换未完成计划"的二次确认路径；删除本身总是显式确认。
 */
export const PlanReplaceConfirmSchema = z
  .object({
    confirmReplace: z.boolean().optional(),
  })
  .strict();
