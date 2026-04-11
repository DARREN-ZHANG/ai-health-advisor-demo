import type { AgentContext, AgentStatusColor } from '../types/agent-context';
import type { InsightRule, InsightSignal, RuleEvaluationResult } from './types';

export class InsightRuleEngine {
  private readonly rules: ReadonlyArray<InsightRule>;

  constructor(rules: ReadonlyArray<InsightRule>) {
    this.rules = rules;
  }

  evaluate(context: AgentContext): RuleEvaluationResult {
    const applicableRules = this.rules.filter((r) =>
      r.appliesTo.includes(context.task.type as never),
    );

    const insights = applicableRules.flatMap((r) => r.evaluate(context));
    const statusColor = deriveStatusColor(insights, context.signals.lowData);

    return {
      insights,
      suggestedChartTokens: [],
      suggestedMicroTips: [],
      statusColor,
    };
  }
}

function deriveStatusColor(
  insights: InsightSignal[],
  lowData: boolean,
): AgentStatusColor {
  if (insights.some((i) => i.severity === 'critical')) return 'red';
  if (lowData || insights.some((i) => i.severity === 'warning')) return 'yellow';
  return 'green';
}
