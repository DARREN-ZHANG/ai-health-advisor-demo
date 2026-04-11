import type { AgentRequest } from '../types/agent-request';
import { resolveTaskRoute } from './task-router';

export interface TaskValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateTaskRequest(request: AgentRequest): TaskValidationResult {
  const errors: string[] = [];
  const route = resolveTaskRoute(request.taskType);

  if (route.requiresUserMessage && !request.userMessage?.trim()) {
    errors.push(`Task '${request.taskType}' requires userMessage`);
  }

  if (route.requiresTab && !request.tab) {
    errors.push(`Task '${request.taskType}' requires tab`);
  }

  if (route.requiresTimeframe && !request.timeframe) {
    errors.push(`Task '${request.taskType}' requires timeframe`);
  }

  return { valid: errors.length === 0, errors };
}
