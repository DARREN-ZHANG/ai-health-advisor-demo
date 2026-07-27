import type { Plan, PlanDraft, PlanDraftInput } from '@health-advisor/shared';
import { InMemoryPlanStore, PlanStoreError } from '../../runtime/plan-store.js';
import type { RuntimeRegistry } from '../../runtime/registry.js';

export { PlanStoreError };

/**
 * Plan 模块对外服务层。
 *
 * - schema 校验在 route 层完成；service 只负责把 store 错误按业务语义暴露。
 * - 不直接持有状态：所有持久化走 RuntimeRegistry.planStore（进程内）。
 */
export class PlanService {
  private readonly store: InMemoryPlanStore;

  constructor(private readonly registry: RuntimeRegistry) {
    this.store = registry.planStore;
  }

  /** 保存 chat 产出的计划草稿；返回带 draftId 的 PlanDraft。 */
  saveDraft(sessionId: string, profileId: string, input: PlanDraftInput): PlanDraft {
    return this.store.saveDraft(sessionId, profileId, input);
  }

  /**
   * 执行草稿。
   *
   * - draftId 失效（不存在 / 已被替换）→ DRAFT_NOT_FOUND 或 DRAFT_REVOKED
   * - 替换未完成计划需 confirmReplace=true
   */
  executeDraft(
    sessionId: string,
    profileId: string,
    draftId: string,
    confirmReplace = false,
  ): Plan {
    return this.store.executeDraft(sessionId, profileId, draftId, confirmReplace);
  }

  /** 取当前计划；不存在返回 null。 */
  getCurrentPlan(sessionId: string, profileId: string): Plan | null {
    return this.store.getCurrentPlan(sessionId, profileId) ?? null;
  }

  /** 结束并清除当前计划。 */
  endPlan(sessionId: string, profileId: string): void {
    this.store.endPlan(sessionId, profileId);
  }

  /**
   * 更新任务完成状态；payload 应先由 route 层用 PlanTaskUpdateRequestSchema 校验。
   * - plan/group/task 不存在 → PLAN_NOT_FOUND
   * - 版本不匹配 → VERSION_MISMATCH
   */
  updateTask(
    sessionId: string,
    profileId: string,
    groupId: string,
    taskId: string,
    expectedVersion: number,
    completed: boolean,
  ): Plan {
    return this.store.updateTask(sessionId, profileId, groupId, taskId, expectedVersion, completed);
  }
}
