import { describe, expect, it } from 'vitest';
import { InMemoryPlanStore, PlanStoreError } from '../../runtime/plan-store.js';
import type { PlanDraftInput } from '@health-advisor/shared';

const validDraft: PlanDraftInput = {
  title: '7 天恢复计划',
  summary: '本周以稳定 HRV 与改善睡眠为主。',
  groups: [
    {
      title: '第 1 天',
      tasks: [
        { title: '餐后散步 15 分钟', estimatedMinutes: 15 },
        { title: '记录晨起 HRV' },
      ],
    },
    {
      title: '第 2 天',
      tasks: [{ title: '23:00 前入睡', suggestedTimeOfDay: '夜间' }],
    },
  ],
};

describe('InMemoryPlanStore.saveDraft', () => {
  it('returns a PlanDraft with a generated draftId and preserves groups', () => {
    const store = new InMemoryPlanStore();
    const draft = store.saveDraft('s1', 'p1', validDraft);
    expect(draft.draftId).toMatch(/^[0-9a-f-]{36}$/);
    expect(draft.title).toBe(validDraft.title);
    expect(draft.groups).toEqual(validDraft.groups);
  });

  it('invalidates the previous draft when a new one is saved', () => {
    const store = new InMemoryPlanStore();
    const first = store.saveDraft('s1', 'p1', validDraft);
    const second = store.saveDraft('s1', 'p1', validDraft);
    expect(first.draftId).not.toBe(second.draftId);

    // 旧 draftId 无法执行
    expect(() => store.executeDraft('s1', 'p1', first.draftId)).toThrowError(PlanStoreError);
    // 新 draftId 可以执行
    const plan = store.executeDraft('s1', 'p1', second.draftId);
    expect(plan.groups).toHaveLength(2);
  });

  it('isolates drafts by sessionId and profileId', () => {
    const store = new InMemoryPlanStore();
    const a = store.saveDraft('s1', 'p1', validDraft);
    const b = store.saveDraft('s1', 'p2', validDraft);
    expect(a.draftId).not.toBe(b.draftId);

    // 在 p2 上执行 b 不影响 p1 的 a
    store.executeDraft('s1', 'p2', b.draftId);
    expect(store.getCurrentPlan('s1', 'p1')).toBeUndefined();
    expect(store.getCurrentPlan('s1', 'p2')).toBeDefined();
  });
});

describe('InMemoryPlanStore.executeDraft', () => {
  it('throws DRAFT_NOT_FOUND when no draft exists', () => {
    const store = new InMemoryPlanStore();
    try {
      store.executeDraft('s1', 'p1', '11111111-1111-4111-8111-111111111111');
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(PlanStoreError);
      expect((error as PlanStoreError).code).toBe('DRAFT_NOT_FOUND');
    }
  });

  it('throws DRAFT_REVOKED when executing a replaced draft', () => {
    const store = new InMemoryPlanStore();
    const first = store.saveDraft('s1', 'p1', validDraft);
    store.saveDraft('s1', 'p1', validDraft);
    try {
      store.executeDraft('s1', 'p1', first.draftId);
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(PlanStoreError);
      expect((error as PlanStoreError).code).toBe('DRAFT_REVOKED');
    }
  });

  it('cannot be executed twice (draft becomes revoked)', () => {
    const store = new InMemoryPlanStore();
    const draft = store.saveDraft('s1', 'p1', validDraft);
    store.executeDraft('s1', 'p1', draft.draftId);
    try {
      store.executeDraft('s1', 'p1', draft.draftId);
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(PlanStoreError);
      expect((error as PlanStoreError).code).toBe('DRAFT_REVOKED');
    }
  });

  it('throws REPLACE_NOT_CONFIRMED when overwriting an active plan without flag', () => {
    const store = new InMemoryPlanStore();
    const first = store.saveDraft('s1', 'p1', validDraft);
    store.executeDraft('s1', 'p1', first.draftId);

    const second = store.saveDraft('s1', 'p1', validDraft);
    try {
      store.executeDraft('s1', 'p1', second.draftId);
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(PlanStoreError);
      expect((error as PlanStoreError).code).toBe('REPLACE_NOT_CONFIRMED');
    }
  });

  it('allows direct replacement of a completed plan without confirmReplace', () => {
    const store = new InMemoryPlanStore();
    const first = store.saveDraft('s1', 'p1', {
      ...validDraft,
      groups: [{ title: '第 1 天', tasks: [{ title: '一次任务' }] }],
    });
    const plan = store.executeDraft('s1', 'p1', first.draftId);
    const groupId = plan.groups[0]!.id;
    const taskId = plan.groups[0]!.tasks[0]!.id;
    store.updateTask('s1', 'p1', groupId, taskId, plan.version, true);
    // 已完成
    expect(store.getCurrentPlan('s1', 'p1')?.status).toBe('completed');

    const second = store.saveDraft('s1', 'p1', validDraft);
    const next = store.executeDraft('s1', 'p1', second.draftId);
    expect(next.version).toBe(1);
    expect(next.status).toBe('active');
  });

  it('generates UUIDs for plan/group/task; LLM never supplies ids', () => {
    const store = new InMemoryPlanStore();
    const draft = store.saveDraft('s1', 'p1', validDraft);
    const plan = store.executeDraft('s1', 'p1', draft.draftId);
    expect(plan.id).toMatch(/^[0-9a-f-]{36}$/);
    for (const group of plan.groups) {
      expect(group.id).toMatch(/^[0-9a-f-]{36}$/);
      for (const task of group.tasks) {
        expect(task.id).toMatch(/^[0-9a-f-]{36}$/);
      }
    }
    expect(plan.version).toBe(1);
    expect(plan.progress).toEqual({ totalTasks: 3, completedTasks: 0 });
    expect(plan.status).toBe('active');
  });
});

describe('InMemoryPlanStore.updateTask', () => {
  function setup() {
    const store = new InMemoryPlanStore();
    const draft = store.saveDraft('s1', 'p1', {
      ...validDraft,
      groups: [
        {
          title: '第 1 天',
          tasks: [
            { title: '任务 A' },
            { title: '任务 B' },
          ],
        },
      ],
    });
    const plan = store.executeDraft('s1', 'p1', draft.draftId);
    return { store, plan };
  }

  it('flips a task to completed and bumps version atomically', () => {
    const { store, plan } = setup();
    const group = plan.groups[0]!;
    const task = group.tasks[0]!;
    const next = store.updateTask('s1', 'p1', group.id, task.id, plan.version, true);
    expect(next.version).toBe(plan.version + 1);
    expect(next.groups[0]!.tasks[0]!.completed).toBe(true);
    expect(next.progress).toEqual({ totalTasks: 2, completedTasks: 1 });
    expect(next.status).toBe('active');
  });

  it('transitions to completed status when all tasks are done', () => {
    const { store, plan } = setup();
    const group = plan.groups[0]!;
    const [taskA, taskB] = group.tasks;
    let next = store.updateTask('s1', 'p1', group.id, taskA!.id, plan.version, true);
    next = store.updateTask('s1', 'p1', group.id, taskB!.id, next.version, true);
    expect(next.status).toBe('completed');
    expect(next.progress).toEqual({ totalTasks: 2, completedTasks: 2 });
  });

  it('recovers back to active when a completed task is unchecked', () => {
    const { store, plan } = setup();
    const group = plan.groups[0]!;
    const [taskA, taskB] = group.tasks;
    let next = store.updateTask('s1', 'p1', group.id, taskA!.id, plan.version, true);
    next = store.updateTask('s1', 'p1', group.id, taskB!.id, next.version, true);
    expect(next.status).toBe('completed');
    next = store.updateTask('s1', 'p1', group.id, taskA!.id, next.version, false);
    expect(next.status).toBe('active');
    expect(next.progress.completedTasks).toBe(1);
  });

  it('rejects concurrent updates via VERSION_MISMATCH', () => {
    const { store, plan } = setup();
    const group = plan.groups[0]!;
    const task = group.tasks[0]!;
    store.updateTask('s1', 'p1', group.id, task.id, plan.version, true);
    try {
      store.updateTask('s1', 'p1', group.id, task.id, plan.version, false);
      throw new Error('expected throw');
    } catch (error) {
      expect((error as PlanStoreError).code).toBe('VERSION_MISMATCH');
    }
  });

  it('rejects unknown task ids with PLAN_NOT_FOUND', () => {
    const { store, plan } = setup();
    try {
      store.updateTask(
        's1',
        'p1',
        plan.groups[0]!.id,
        '11111111-1111-4111-8111-111111111111',
        plan.version,
        true,
      );
      throw new Error('expected throw');
    } catch (error) {
      expect((error as PlanStoreError).code).toBe('PLAN_NOT_FOUND');
    }
  });
});

describe('InMemoryPlanStore.endPlan', () => {
  it('clears the current plan', () => {
    const store = new InMemoryPlanStore();
    const draft = store.saveDraft('s1', 'p1', validDraft);
    store.executeDraft('s1', 'p1', draft.draftId);
    expect(store.getCurrentPlan('s1', 'p1')).toBeDefined();
    store.endPlan('s1', 'p1');
    expect(store.getCurrentPlan('s1', 'p1')).toBeUndefined();
  });

  it('is idempotent when no plan exists', () => {
    const store = new InMemoryPlanStore();
    expect(() => store.endPlan('s1', 'p1')).not.toThrow();
  });
});

describe('InMemoryPlanStore.clearSession', () => {
  it('removes all profile slots under the given session', () => {
    const store = new InMemoryPlanStore();
    const a = store.saveDraft('s1', 'p1', validDraft);
    const b = store.saveDraft('s1', 'p2', validDraft);
    store.executeDraft('s1', 'p1', a.draftId);
    store.executeDraft('s1', 'p2', b.draftId);
    store.clearSession('s1');
    expect(store.getCurrentPlan('s1', 'p1')).toBeUndefined();
    expect(store.getCurrentPlan('s1', 'p2')).toBeUndefined();
  });

  it('does not affect other sessions', () => {
    const store = new InMemoryPlanStore();
    const a = store.saveDraft('s1', 'p1', validDraft);
    const b = store.saveDraft('s2', 'p1', validDraft);
    store.executeDraft('s1', 'p1', a.draftId);
    store.executeDraft('s2', 'p1', b.draftId);
    store.clearSession('s1');
    expect(store.getCurrentPlan('s1', 'p1')).toBeUndefined();
    expect(store.getCurrentPlan('s2', 'p1')).toBeDefined();
  });
});
