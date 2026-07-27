import { randomUUID } from 'node:crypto';
import type {
  Plan,
  PlanDraft,
  PlanDraftInput,
  PlanGroup,
  PlanGroupDraft,
  PlanProgress,
  PlanStatus,
  PlanTask,
  PlanTaskDraft,
} from '@health-advisor/shared';
import {
  MAX_PLAN_GROUPS,
  MAX_PLAN_TASKS_PER_GROUP,
  PlanDraftInputSchema,
} from '@health-advisor/shared';

/**
 * 进程内会话级计划存储。
 *
 * 关键约束：
 * - 隔离键为 `sessionId::profileId`。同一个页面会话内不同 profile 完全隔离。
 * - 每个 (sessionId, profileId) 至多一个 currentDraft（最新一次 chat 输出）和一个 currentPlan（已执行）。
 * - 旧 draftId 在新 draft 写入时进入 revoked 集合；execute / patch 必须拒绝 revoked 的 draftId。
 * - 不做任何数据库持久化：硬刷新或新标签页（新 sessionId）后状态消失。
 *
 * 出错语义：
 * - execute 不存在的 draftId → `DRAFT_NOT_FOUND`
 * - execute 已被替换的 draftId → `DRAFT_REVOKED`
 * - execute 未完成计划且未显式 confirmReplace → `REPLACE_NOT_CONFIRMED`
 * - updateTask expectedVersion 不匹配 → `VERSION_MISMATCH`
 * - updateTask 在已结束 / 不存在的 plan 上 → `PLAN_NOT_FOUND`
 *
 * 调用方应捕获这些错误并映射到 HTTP 状态码。
 */

/** 内部错误码，route 层据此映射 HTTP 状态。 */
export type PlanStoreErrorCode =
  | 'DRAFT_NOT_FOUND'
  | 'DRAFT_REVOKED'
  | 'REPLACE_NOT_CONFIRMED'
  | 'PLAN_NOT_FOUND'
  | 'VERSION_MISMATCH';

export class PlanStoreError extends Error {
  constructor(public readonly code: PlanStoreErrorCode, message: string) {
    super(message);
    this.name = 'PlanStoreError';
  }
}

interface PlanSlot {
  /** 最新未执行草稿（仅一个）；执行后清空。 */
  currentDraft: { draftId: string; draft: PlanDraftInput; createdAt: string } | undefined;
  /** 已执行的当前计划；endPlan 时清除。 */
  currentPlan: Plan | undefined;
  /** 已被新 draft 替换或已执行的 draftId，一律不可再 execute。 */
  revokedDraftIds: Set<string>;
}

function slotKey(sessionId: string, profileId: string): string {
  return `${sessionId}::${profileId}`;
}

export class InMemoryPlanStore {
  private readonly slots = new Map<string, PlanSlot>();

  /**
   * 保存一条新草稿；同时作废该 (sessionId, profileId) 上之前的草稿。
   * 返回带 draftId 的 PlanDraft（draftId 由服务端生成，LLM 不参与）。
   */
  saveDraft(sessionId: string, profileId: string, input: PlanDraftInput): PlanDraft {
    const parsed = PlanDraftInputSchema.parse(input);
    const key = slotKey(sessionId, profileId);
    const slot = this.slots.get(key) ?? { currentDraft: undefined, currentPlan: undefined, revokedDraftIds: new Set<string>() };

    if (slot.currentDraft) {
      slot.revokedDraftIds.add(slot.currentDraft.draftId);
    }

    const draftId = randomUUID();
    const createdAt = new Date().toISOString();
    slot.currentDraft = { draftId, draft: parsed, createdAt };
    this.slots.set(key, slot);

    return {
      draftId,
      title: parsed.title,
      summary: parsed.summary,
      groups: parsed.groups,
      createdAt,
    };
  }

  /** 取最新草稿（不含已作废）。仅用于测试与内部诊断，route 不直接暴露。 */
  peekDraft(sessionId: string, profileId: string): PlanDraft | undefined {
    const slot = this.slots.get(slotKey(sessionId, profileId));
    if (!slot?.currentDraft) return undefined;
    const { draftId, draft, createdAt } = slot.currentDraft;
    return { draftId, ...draft, createdAt };
  }

  /**
   * 执行草稿：将 draft 转换为持久化 Plan。
   *
   * - 校验 draftId 是当前最新草稿（revoked 一律拒绝）。
   * - 替换未完成计划需 confirmReplace=true；已完成计划可直接替换。
   * - 写入后清空 currentDraft，draftId 加入 revoked 防止二次执行。
   */
  executeDraft(
    sessionId: string,
    profileId: string,
    draftId: string,
    confirmReplace = false,
  ): Plan {
    const key = slotKey(sessionId, profileId);
    const slot = this.slots.get(key);
    if (!slot || (!slot.currentDraft && !slot.revokedDraftIds.has(draftId))) {
      throw new PlanStoreError('DRAFT_NOT_FOUND', `Draft ${draftId} not found`);
    }
    if (slot.revokedDraftIds.has(draftId) || slot.currentDraft?.draftId !== draftId) {
      throw new PlanStoreError('DRAFT_REVOKED', `Draft ${draftId} is no longer executable`);
    }

    if (slot.currentPlan && slot.currentPlan.status !== 'completed' && !confirmReplace) {
      throw new PlanStoreError(
        'REPLACE_NOT_CONFIRMED',
        'Current plan is in progress; confirmReplace is required to overwrite',
      );
    }

    const plan = buildPlanFromDraft({
      draftId,
      draft: slot.currentDraft.draft,
      sessionId,
      profileId,
      executedAt: new Date().toISOString(),
    });

    slot.currentPlan = plan;
    slot.currentDraft = undefined;
    slot.revokedDraftIds.add(draftId);
    return plan;
  }

  /** 取当前计划；不存在返回 undefined。 */
  getCurrentPlan(sessionId: string, profileId: string): Plan | undefined {
    return this.slots.get(slotKey(sessionId, profileId))?.currentPlan;
  }

  /**
   * 原子更新任务完成状态。
   *
   * - 版本必须匹配；不匹配一律拒绝（不静默合并）。
   * - 重新计算 progress；据此切换 status：active→completed 或 completed→active。
   */
  updateTask(
    sessionId: string,
    profileId: string,
    groupId: string,
    taskId: string,
    expectedVersion: number,
    completed: boolean,
  ): Plan {
    const key = slotKey(sessionId, profileId);
    const slot = this.slots.get(key);
    const plan = slot?.currentPlan;
    if (!plan) {
      throw new PlanStoreError('PLAN_NOT_FOUND', `No active plan for profile ${profileId}`);
    }
    if (plan.version !== expectedVersion) {
      throw new PlanStoreError(
        'VERSION_MISMATCH',
        `Expected version ${expectedVersion}, got ${plan.version}`,
      );
    }

    const group = plan.groups.find((g) => g.id === groupId);
    if (!group) {
      throw new PlanStoreError('PLAN_NOT_FOUND', `Group ${groupId} not found`);
    }
    const taskIndex = group.tasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) {
      throw new PlanStoreError('PLAN_NOT_FOUND', `Task ${taskId} not found`);
    }
    const task = group.tasks[taskIndex]!;
    const updatedTask: PlanTask =
      task.completed === completed ? task : { ...task, completed };
    const updatedGroup: PlanGroup = {
      ...group,
      tasks: group.tasks.map((t) => (t.id === taskId ? updatedTask : t)),
    };
    return commitTaskUpdate(plan, updatedGroup, slot);
  }

  /** 结束并清除当前计划。 */
  endPlan(sessionId: string, profileId: string): void {
    const key = slotKey(sessionId, profileId);
    const slot = this.slots.get(key);
    if (slot) {
      slot.currentPlan = undefined;
    }
  }

  /** Session 过期清理：清除该 session 下所有 profile slot。 */
  clearSession(sessionId: string): void {
    const prefix = `${sessionId}::`;
    for (const key of this.slots.keys()) {
      if (key.startsWith(prefix)) {
        this.slots.delete(key);
      }
    }
  }
}

/**
 * 不可变更新：以新的 group 列表重建 plan 的 progress/status/version，
 * 写入 slot 并返回新对象。每次调用都 version+1，便于客户端基于
 * expectedVersion 防并发覆盖。
 */
function commitTaskUpdate(plan: Plan, updatedGroup: PlanGroup, slot: PlanSlot): Plan {
  const groups = plan.groups.map((g) => (g.id === updatedGroup.id ? updatedGroup : g));
  const progress = computeProgress(groups);
  const status: PlanStatus =
    progress.completedTasks === progress.totalTasks ? 'completed' : 'active';
  const next: Plan = {
    ...plan,
    groups,
    progress,
    status,
    version: plan.version + 1,
  };
  slot.currentPlan = next;
  return next;
}

function computeProgress(groups: PlanGroup[]): PlanProgress {
  let totalTasks = 0;
  let completedTasks = 0;
  for (const group of groups) {
    totalTasks += group.tasks.length;
    for (const task of group.tasks) {
      if (task.completed) completedTasks += 1;
    }
  }
  return { totalTasks, completedTasks };
}

interface BuildPlanInput {
  draftId: string;
  draft: PlanDraftInput;
  sessionId: string;
  profileId: string;
  executedAt: string;
}

function buildPlanFromDraft(input: BuildPlanInput): Plan {
  void input.draftId; // draftId 仅用于 revoke 集合，不进入 plan 字段
  const groups: PlanGroup[] = input.draft.groups.map((group: PlanGroupDraft) => {
    const tasks: PlanTask[] = group.tasks.map((task: PlanTaskDraft) => ({
      id: randomUUID(),
      title: task.title,
      ...(task.description !== undefined ? { description: task.description } : {}),
      ...(task.suggestedTimeOfDay !== undefined ? { suggestedTimeOfDay: task.suggestedTimeOfDay } : {}),
      ...(task.estimatedMinutes !== undefined ? { estimatedMinutes: task.estimatedMinutes } : {}),
      completed: false,
    }));
    if (tasks.length > MAX_PLAN_TASKS_PER_GROUP) {
      // 服务端 schema 已限制；防御性检查防止上游绕过。
      throw new PlanStoreError('PLAN_NOT_FOUND', `Group exceeds ${MAX_PLAN_TASKS_PER_GROUP} tasks`);
    }
    return {
      id: randomUUID(),
      title: group.title,
      tasks,
    };
  });
  if (groups.length > MAX_PLAN_GROUPS) {
    throw new PlanStoreError('PLAN_NOT_FOUND', `Plan exceeds ${MAX_PLAN_GROUPS} groups`);
  }
  const progress = computeProgress(groups);
  return {
    id: randomUUID(),
    profileId: input.profileId,
    sessionId: input.sessionId,
    title: input.draft.title,
    summary: input.draft.summary,
    groups,
    status: 'active',
    version: 1,
    progress,
    createdAt: input.executedAt,
    executedAt: input.executedAt,
  };
}
