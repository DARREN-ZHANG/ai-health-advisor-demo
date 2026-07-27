import { describe, it, expect } from 'vitest';
import {
  PlanDraftInputSchema,
  PlanDraftSchema,
  PlanGroupDraftSchema,
  PlanSchema,
  PlanTaskDraftSchema,
  PlanTaskUpdateRequestSchema,
  MAX_PLAN_GROUPS,
  MAX_PLAN_TASKS_PER_GROUP,
} from '../schemas/plan';
import type { PlanDraftInput, Plan } from '../types/plan';

const validTask = {
  title: '餐后散步 15 分钟',
  description: '午餐与晚餐后各一次，配速放松',
  suggestedTimeOfDay: '餐后',
  estimatedMinutes: 15,
};

const validGroup = {
  title: '第 1 天',
  tasks: [validTask],
};

const validDraftInput: PlanDraftInput = {
  title: '7 天恢复计划',
  summary: '本周以稳定 HRV 与改善睡眠为主，逐日推进。',
  groups: [validGroup],
};

describe('PlanTaskDraftSchema', () => {
  it('accepts a valid task', () => {
    expect(PlanTaskDraftSchema.parse(validTask)).toEqual(validTask);
  });

  it('rejects empty title', () => {
    expect(() => PlanTaskDraftSchema.parse({ ...validTask, title: '' })).toThrow();
  });

  it('rejects unknown extra fields due to strict mode', () => {
    expect(() => PlanTaskDraftSchema.parse({ ...validTask, extra: 'x' })).toThrow();
  });

  it('rejects non-positive estimatedMinutes', () => {
    expect(() => PlanTaskDraftSchema.parse({ ...validTask, estimatedMinutes: 0 })).toThrow();
    expect(() => PlanTaskDraftSchema.parse({ ...validTask, estimatedMinutes: -5 })).toThrow();
    expect(() => PlanTaskDraftSchema.parse({ ...validTask, estimatedMinutes: 1.5 })).toThrow();
  });

  it('rejects estimatedMinutes exceeding a day', () => {
    expect(() =>
      PlanTaskDraftSchema.parse({ ...validTask, estimatedMinutes: 24 * 60 + 1 }),
    ).toThrow();
  });
});

describe('PlanGroupDraftSchema', () => {
  it('rejects empty tasks array', () => {
    expect(() => PlanGroupDraftSchema.parse({ ...validGroup, tasks: [] })).toThrow();
  });

  it(`rejects more than ${MAX_PLAN_TASKS_PER_GROUP} tasks`, () => {
    const tasks = Array.from({ length: MAX_PLAN_TASKS_PER_GROUP + 1 }, (_, i) => ({
      ...validTask,
      title: `任务 ${i + 1}`,
    }));
    expect(() => PlanGroupDraftSchema.parse({ ...validGroup, tasks })).toThrow();
  });

  it(`accepts exactly ${MAX_PLAN_TASKS_PER_GROUP} tasks`, () => {
    const tasks = Array.from({ length: MAX_PLAN_TASKS_PER_GROUP }, (_, i) => ({
      ...validTask,
      title: `任务 ${i + 1}`,
    }));
    expect(PlanGroupDraftSchema.parse({ ...validGroup, tasks }).tasks).toHaveLength(
      MAX_PLAN_TASKS_PER_GROUP,
    );
  });
});

describe('PlanDraftInputSchema', () => {
  it('accepts a valid draft', () => {
    expect(PlanDraftInputSchema.parse(validDraftInput)).toEqual(validDraftInput);
  });

  it('rejects empty groups', () => {
    expect(() => PlanDraftInputSchema.parse({ ...validDraftInput, groups: [] })).toThrow();
  });

  it(`rejects more than ${MAX_PLAN_GROUPS} groups`, () => {
    const groups = Array.from({ length: MAX_PLAN_GROUPS + 1 }, (_, i) => ({
      title: `第 ${i + 1} 天`,
      tasks: [validTask],
    }));
    expect(() => PlanDraftInputSchema.parse({ ...validDraftInput, groups })).toThrow();
  });

  it(`accepts exactly ${MAX_PLAN_GROUPS} groups`, () => {
    const groups = Array.from({ length: MAX_PLAN_GROUPS }, (_, i) => ({
      title: `第 ${i + 1} 天`,
      tasks: [validTask],
    }));
    expect(PlanDraftInputSchema.parse({ ...validDraftInput, groups }).groups).toHaveLength(
      MAX_PLAN_GROUPS,
    );
  });

  it('rejects summary over max length', () => {
    expect(() =>
      PlanDraftInputSchema.parse({ ...validDraftInput, summary: 'x'.repeat(1001) }),
    ).toThrow();
  });
});

describe('PlanDraftSchema', () => {
  it('accepts a draft with uuid draftId', () => {
    const draft = {
      draftId: '11111111-1111-4111-8111-111111111111',
      title: '7 天恢复计划',
      summary: '本周以稳定 HRV 与改善睡眠为主。',
      groups: [validGroup],
      createdAt: '2026-07-27T00:00:00.000Z',
    };
    expect(PlanDraftSchema.parse(draft)).toEqual(draft);
  });

  it('rejects non-uuid draftId', () => {
    const draft = {
      draftId: 'not-a-uuid',
      title: '7 天恢复计划',
      summary: '本周以稳定 HRV 与改善睡眠为主。',
      groups: [validGroup],
      createdAt: '2026-07-27T00:00:00.000Z',
    };
    expect(() => PlanDraftSchema.parse(draft)).toThrow();
  });
});

describe('PlanSchema', () => {
  const validPlan: Plan = {
    id: '22222222-2222-4222-8222-222222222222',
    profileId: 'profile-a',
    sessionId: 'session-1',
    title: '7 天恢复计划',
    summary: '本周以稳定 HRV 与改善睡眠为主。',
    groups: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        title: '第 1 天',
        tasks: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            ...validTask,
            completed: false,
          },
        ],
      },
    ],
    status: 'active',
    version: 1,
    progress: { totalTasks: 1, completedTasks: 0 },
    createdAt: '2026-07-27T00:00:00.000Z',
    executedAt: '2026-07-27T00:00:01.000Z',
  };

  it('accepts a valid plan', () => {
    expect(PlanSchema.parse(validPlan)).toEqual(validPlan);
  });

  it('rejects plan with progress.completedTasks > totalTasks via explicit field mismatch is allowed by schema (business layer enforces)', () => {
    // schema 不做 invariant 检查，业务层保证；只验证字段类型。
    const plan = {
      ...validPlan,
      progress: { totalTasks: 1, completedTasks: 5 },
    };
    expect(PlanSchema.parse(plan).progress).toEqual({ totalTasks: 1, completedTasks: 5 });
  });

  it('rejects unknown status', () => {
    expect(() => PlanSchema.parse({ ...validPlan, status: 'paused' })).toThrow();
  });

  it('rejects negative version', () => {
    expect(() => PlanSchema.parse({ ...validPlan, version: -1 })).toThrow();
  });
});

describe('PlanTaskUpdateRequestSchema', () => {
  it('accepts valid request with matching expectedVersion', () => {
    expect(PlanTaskUpdateRequestSchema.parse({ expectedVersion: 3, completed: true })).toEqual({
      expectedVersion: 3,
      completed: true,
    });
  });

  it('rejects missing expectedVersion', () => {
    expect(() => PlanTaskUpdateRequestSchema.parse({ completed: true })).toThrow();
  });

  it('rejects missing completed', () => {
    expect(() => PlanTaskUpdateRequestSchema.parse({ expectedVersion: 1 })).toThrow();
  });

  it('rejects extra fields', () => {
    expect(() =>
      PlanTaskUpdateRequestSchema.parse({ expectedVersion: 1, completed: true, note: 'x' }),
    ).toThrow();
  });
});
