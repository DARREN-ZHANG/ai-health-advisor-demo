import { AgentTaskType } from '@health-advisor/shared';

/**
 * agent-core 内部任务类型扩展。
 * 'micro_insight' 暂不加入 shared AgentTaskType，保留为内部使用。
 */
export type InternalTaskType = AgentTaskType | 'micro_insight';

export const INTERNAL_TASK_TYPES: readonly InternalTaskType[] = [
  ...Object.values(AgentTaskType),
  'micro_insight',
] as const;

export function isSharedTaskType(t: InternalTaskType): t is AgentTaskType {
  return Object.values<string>(AgentTaskType).includes(t);
}
