import { AgentTaskType } from '@health-advisor/shared';
import type { InternalTaskType } from '../types/internal-task-type';

export interface TaskRoute {
  taskType: InternalTaskType;
  requiresUserMessage: boolean;
  requiresTab: boolean;
  requiresTimeframe: boolean;
  windowDays: number;
  maxSummaryLength: number;
}

export const TASK_ROUTES: Record<InternalTaskType, TaskRoute> = {
  [AgentTaskType.HOMEPAGE_SUMMARY]: {
    taskType: AgentTaskType.HOMEPAGE_SUMMARY,
    requiresUserMessage: false,
    requiresTab: false,
    requiresTimeframe: false,
    windowDays: 14,
    maxSummaryLength: 120,
  },
  [AgentTaskType.VIEW_SUMMARY]: {
    taskType: AgentTaskType.VIEW_SUMMARY,
    requiresUserMessage: false,
    requiresTab: true,
    requiresTimeframe: true,
    windowDays: 0, // 由请求中的 timeframe 决定
    maxSummaryLength: 220,
  },
  [AgentTaskType.ADVISOR_CHAT]: {
    taskType: AgentTaskType.ADVISOR_CHAT,
    requiresUserMessage: true,
    requiresTab: false,
    requiresTimeframe: false,
    windowDays: 14,
    maxSummaryLength: 300,
  },
  micro_insight: {
    taskType: 'micro_insight',
    requiresUserMessage: false,
    requiresTab: false,
    requiresTimeframe: false,
    windowDays: 5,
    maxSummaryLength: 60,
  },
};

export function resolveTaskRoute(taskType: InternalTaskType): TaskRoute {
  const route = TASK_ROUTES[taskType];
  if (!route) {
    throw new Error(`Unknown task type: ${taskType}`);
  }
  return route;
}
