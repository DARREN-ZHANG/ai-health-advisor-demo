import type { ChartTokenId } from '@health-advisor/shared';
import type { AgentStatusColor } from '../types/agent-context';
import type { InternalTaskType } from '../types/internal-task-type';
import type { AgentContext } from '../types/agent-context';

export type InsightSeverity = 'info' | 'warning' | 'critical';

export type InsightCategory = 'status' | 'anomaly' | 'trend' | 'suggestion' | 'data-quality';

export interface InsightSignal {
  category: InsightCategory;
  severity: InsightSeverity;
  metric?: string;
  message: string;
}

export interface RuleEvaluationResult {
  insights: InsightSignal[];
  suggestedChartTokens: ChartTokenId[];
  suggestedMicroTips: string[];
  statusColor: AgentStatusColor;
}

export interface InsightRule {
  readonly id: string;
  readonly appliesTo: InternalTaskType[];
  evaluate(context: AgentContext): InsightSignal[];
}
