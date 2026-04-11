import { ChartTokenId, type DataTab } from '@health-advisor/shared';
import { AgentTaskType } from '@health-advisor/shared';
import type { AgentContext } from '../types/agent-context';
import type { InsightRule, InsightSignal, RuleEvaluationResult } from './types';
import { InsightRuleEngine } from './rule-engine';
import { average, getRecords, computeHrv, computeTrend } from './helpers';

// ────────────────────────────────────────────
// Tab 专用规则：根据当前 tab 聚焦分析
// ────────────────────────────────────────────

const hrvTabRule: InsightRule = {
  id: 'view-summary-hrv',
  appliesTo: [AgentTaskType.VIEW_SUMMARY],
  evaluate(ctx: AgentContext): InsightSignal[] {
    if (ctx.task.tab !== 'hrv') return [];
    const records = getRecords(ctx);
    const hrValues = records.map(computeHrv).filter(Number.isFinite);
    if (hrValues.length < 3) return [];

    const trend = computeTrend(hrValues);
    const avg = average(hrValues);

    const signals: InsightSignal[] = [];

    if (trend < -0.15) {
      signals.push({
        category: 'anomaly',
        severity: 'warning',
        metric: 'hrv',
        message: `HRV 呈下降趋势，近 ${hrValues.length} 天平均值 ${avg.toFixed(1)} ms`,
      });
    } else if (trend > 0.15) {
      signals.push({
        category: 'trend',
        severity: 'info',
        metric: 'hrv',
        message: `HRV 呈上升趋势，恢复状态良好`,
      });
    } else {
      signals.push({
        category: 'trend',
        severity: 'info',
        metric: 'hrv',
        message: `HRV 趋势稳定，平均值 ${avg.toFixed(1)} ms`,
      });
    }

    return signals;
  },
};

const sleepTabRule: InsightRule = {
  id: 'view-summary-sleep',
  appliesTo: [AgentTaskType.VIEW_SUMMARY],
  evaluate(ctx: AgentContext): InsightSignal[] {
    if (ctx.task.tab !== 'sleep') return [];
    const records = getRecords(ctx);
    const sleepMinutes = records
      .map((r) => r.sleep?.totalMinutes)
      .filter((v): v is number => v !== undefined);
    if (sleepMinutes.length < 3) return [];

    const avg = average(sleepMinutes);
    const avgScore = average(
      records.map((r) => r.sleep?.score).filter((v): v is number => v !== undefined),
    );

    if (avg < 300 || avgScore < 40) {
      return [{
        category: 'anomaly',
        severity: 'warning',
        metric: 'sleep',
        message: `睡眠质量差：平均 ${Math.round(avg / 60 * 10) / 10} 小时，评分 ${Math.round(avgScore)}`,
      }];
    }
    return [{
      category: 'trend',
      severity: 'info',
      metric: 'sleep',
      message: `睡眠趋势稳定：平均 ${Math.round(avg / 60 * 10) / 10} 小时，评分 ${Math.round(avgScore)}`,
    }];
  },
};

const stressTabRule: InsightRule = {
  id: 'view-summary-stress',
  appliesTo: [AgentTaskType.VIEW_SUMMARY],
  evaluate(ctx: AgentContext): InsightSignal[] {
    if (ctx.task.tab !== 'stress') return [];
    const records = getRecords(ctx);
    const loads = records
      .map((r) => r.stress?.load)
      .filter((v): v is number => v !== undefined);
    if (loads.length < 3) return [];

    const avg = average(loads);
    const max = Math.max(...loads);
    const trend = computeTrend(loads);

    if (avg >= 70) {
      return [{
        category: 'anomaly',
        severity: 'warning',
        metric: 'stress',
        message: `压力负荷偏高（均值 ${Math.round(avg)}，峰值 ${max}），${trend > 0 ? '且呈上升趋势' : '需关注'}`,
      }];
    }
    return [{
      category: 'trend',
      severity: 'info',
      metric: 'stress',
      message: `压力水平正常（均值 ${Math.round(avg)}）`,
    }];
  },
};

const activityTabRule: InsightRule = {
  id: 'view-summary-activity',
  appliesTo: [AgentTaskType.VIEW_SUMMARY],
  evaluate(ctx: AgentContext): InsightSignal[] {
    if (ctx.task.tab !== 'activity') return [];
    const records = getRecords(ctx);
    const steps = records
      .map((r) => r.activity?.steps)
      .filter((v): v is number => v !== undefined);
    if (steps.length < 3) return [];

    const avgSteps = average(steps);

    if (avgSteps < 4000) {
      return [{
        category: 'suggestion',
        severity: 'warning',
        metric: 'activity',
        message: `日均步数 ${Math.round(avgSteps)}，活动量明显不足`,
      }];
    }
    return [{
      category: 'trend',
      severity: 'info',
      metric: 'activity',
      message: `日均步数 ${Math.round(avgSteps)}，活动量达标`,
    }];
  },
};

const spo2TabRule: InsightRule = {
  id: 'view-summary-spo2',
  appliesTo: [AgentTaskType.VIEW_SUMMARY],
  evaluate(ctx: AgentContext): InsightSignal[] {
    if (ctx.task.tab !== 'spo2') return [];
    const records = getRecords(ctx);
    const values = records
      .map((r) => r.spo2)
      .filter((v): v is number => v !== undefined);
    if (values.length < 2) return [];

    const avg = average(values);
    if (avg < 93) {
      return [{
        category: 'anomaly',
        severity: 'critical',
        metric: 'spo2',
        message: `血氧均值 ${Math.round(avg)}%，严重偏低，建议就医`,
      }];
    }
    if (avg < 95) {
      return [{
        category: 'anomaly',
        severity: 'warning',
        metric: 'spo2',
        message: `血氧均值 ${Math.round(avg)}%，略低于正常范围`,
      }];
    }
    return [{
      category: 'trend',
      severity: 'info',
      metric: 'spo2',
      message: `血氧水平正常（均值 ${Math.round(avg)}%）`,
    }];
  },
};

const restingHrTabRule: InsightRule = {
  id: 'view-summary-resting-hr',
  appliesTo: [AgentTaskType.VIEW_SUMMARY],
  evaluate(ctx: AgentContext): InsightSignal[] {
    if (ctx.task.tab !== 'resting-hr') return [];
    const records = getRecords(ctx);
    const hrValues = records
      .map((r) => r.hr?.[0])
      .filter((v): v is number => v !== undefined);
    if (hrValues.length < 3) return [];

    const avg = average(hrValues);
    const baseline = ctx.profile.baselines.restingHR;
    const deviation = (avg - baseline) / baseline;

    if (deviation > 0.2) {
      return [{
        category: 'anomaly',
        severity: 'warning',
        metric: 'resting-hr',
        message: `静息心率偏高（均值 ${Math.round(avg)} bpm，基线 ${baseline} bpm）`,
      }];
    }
    return [{
      category: 'trend',
      severity: 'info',
      metric: 'resting-hr',
      message: `静息心率稳定（均值 ${Math.round(avg)} bpm）`,
    }];
  },
};

// ────────────────────────────────────────────
// 导出
// ────────────────────────────────────────────

export const viewSummaryRules: InsightRule[] = [
  hrvTabRule,
  sleepTabRule,
  stressTabRule,
  activityTabRule,
  spo2TabRule,
  restingHrTabRule,
];

const TAB_TOKEN_MAP: Record<DataTab, ChartTokenId> = {
  hrv: ChartTokenId.HRV_7DAYS,
  sleep: ChartTokenId.SLEEP_7DAYS,
  'resting-hr': ChartTokenId.RESTING_HR_7DAYS,
  activity: ChartTokenId.ACTIVITY_7DAYS,
  spo2: ChartTokenId.SPO2_7DAYS,
  stress: ChartTokenId.STRESS_LOAD_7DAYS,
};

export function evaluateViewSummaryRules(ctx: AgentContext): RuleEvaluationResult {
  const engine = new InsightRuleEngine(viewSummaryRules);
  const base = engine.evaluate(ctx);
  const tab = ctx.task.tab;
  const tokens: ChartTokenId[] = tab && TAB_TOKEN_MAP[tab]
    ? [TAB_TOKEN_MAP[tab]]
    : [];

  return {
    ...base,
    suggestedChartTokens: tokens,
    suggestedMicroTips: base.insights
      .filter((i) => i.severity !== 'info')
      .slice(0, 3)
      .map((i) => i.message),
  };
}
