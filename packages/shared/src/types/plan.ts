/**
 * 计划（Plan）相关的共享类型。
 *
 * 三层固定结构：Plan → PlanGroup（顺序分组，例如"第 N 天"） → PlanTask。
 *
 * 设计约束：
 * - LLM 只产出 draft 形态（无 id，无运行时状态）。
 * - 服务端在执行时生成 UUID，并按 profile/session 隔离。
 * - 执行后结构冻结，只能勾选/取消勾选叶子任务；父级进度由叶子推导。
 * - 不绑定真实日期，不持久化到数据库，只在当前页面会话内有效。
 *
 * 这里只定义协议形态，不规定存储位置；后端用进程内 store 持有当前会话的
 * 最新 draft 与 plan，前端只消费结构化响应。
 */

/** 任务的可选建议时段，自由短文本，由 LLM 产出（如 "上午"、"晚餐前"）。 */
export type PlanTimeOfDay = string;

/** LLM 产出的任务草稿（无 id，无状态）。 */
export interface PlanTaskDraft {
  title: string;
  description?: string;
  suggestedTimeOfDay?: PlanTimeOfDay;
  estimatedMinutes?: number;
}

/** LLM 产出的分组草稿（无 id）。 */
export interface PlanGroupDraft {
  title: string;
  tasks: PlanTaskDraft[];
}

/** LLM 产出的完整计划草稿（无 id，作为 chat 响应或后续调整的输入）。 */
export interface PlanDraftInput {
  title: string;
  summary: string;
  groups: PlanGroupDraft[];
}

/**
 * 服务端生成的草稿摘要。
 *
 * chat 响应中携带此字段供前端展示预览。draftId 是执行入口；
 * 后续 chat 调整会产出新 draftId，旧 draftId 在 UI 与 API 两层都失效。
 */
export interface PlanDraft {
  draftId: string;
  title: string;
  summary: string;
  groups: PlanGroupDraft[];
  createdAt: string;
}

/** 服务端持久化的任务（带 id 与 completed 状态）。 */
export interface PlanTask {
  id: string;
  title: string;
  description?: string;
  suggestedTimeOfDay?: PlanTimeOfDay;
  estimatedMinutes?: number;
  completed: boolean;
}

/** 服务端持久化的分组（带 id）。 */
export interface PlanGroup {
  id: string;
  title: string;
  tasks: PlanTask[];
}

/** 计划的执行状态。 */
export type PlanStatus = 'active' | 'completed';

/**
 * 服务端持久化的完整计划。
 *
 * - `version` 每次任务变更递增，配合 expectedVersion 防止并发覆盖。
 * - `progress` 由服务端从叶子任务推导，前端只读。
 * - 结构一旦执行即冻结；只能修改任务的 completed 字段。
 */
export interface Plan {
  id: string;
  profileId: string;
  sessionId: string;
  title: string;
  summary: string;
  groups: PlanGroup[];
  status: PlanStatus;
  version: number;
  progress: PlanProgress;
  createdAt: string;
  executedAt: string;
}

/** 计划进度，由所有叶子任务自动推导。 */
export interface PlanProgress {
  totalTasks: number;
  completedTasks: number;
}
