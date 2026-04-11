import { ChartTokenId } from '@health-advisor/shared';
import { AgentTaskType } from '@health-advisor/shared';
import type { AgentContext } from '../types/agent-context';
import type { InsightRule, InsightSignal, RuleEvaluationResult } from './types';
import { InsightRuleEngine } from './rule-engine';
import { average, getRecords, computeHrv, computeTrend } from './helpers';

// ────────────────────────────────────────────
// HRV 趋势规则
// ────────────────────────────────────────────

const hrvTrendRule: InsightRule = {
  id: 'homepage-hrv-trend',
  appliesTo: [AgentTaskType.HOMEPAGE_SUMMARY],
  evaluate(ctx: AgentContext): InsightSignal[] {
    const records = getRecords(ctx);
    const hrValues = records.map((r) => computeHrv(r)).filter(Number.isFinite);
    if (hrValues.length < 3) return [];

    const trend = computeTrend(hrValues);
    if (trend < -0.15) {
      return [{
        category: 'anomaly',
        severity: 'warning',
        metric: 'hrv',
        message: '心率变异性呈下降趋势，自主神经调节能力可能减弱',
      }];
    }
    if (trend > 0.15) {
      return [{
        category: 'trend',
        severity: 'info',
        metric: 'hrv',
        message: '心率变异性呈上升趋势，恢复状态良好',
      }];
    }
    return [];
  },
};

// ────────────────────────────────────────────
// 睡眠规则
// ────────────────────────────────────────────

const sleepRule: InsightRule = {
  id: 'homepage-sleep',
  appliesTo: [AgentTaskType.HOMEPAGE_SUMMARY],
  evaluate(ctx: AgentContext): InsightSignal[] {
    const records = getRecords(ctx);
    const sleepMinutes = records
      .map((r) => r.sleep?.totalMinutes)
      .filter((v): v is number => v !== undefined);
    if (sleepMinutes.length < 3) return [];

    const avg = average(sleepMinutes);
    const baseline = ctx.profile.baselines.avgSleepMinutes;

    if (avg < baseline * 0.6) {
      return [{
        category: 'anomaly',
        severity: 'warning',
        metric: 'sleep',
        message: `近 ${sleepMinutes.length} 天平均睡眠 ${Math.round(avg / 60 * 10) / 10} 小时，严重不足`,
      }];
    }
    if (avg < baseline * 0.8) {
      return [{
        category: 'status',
        severity: 'info',
        metric: 'sleep',
        message: `近 ${sleepMinutes.length} 天平均睡眠 ${Math.round(avg / 60 * 10) / 10} 小时，略低于推荐`,
      }];
    }
    return [];
  },
};

// ────────────────────────────────────────────
// 血氧规则
// ────────────────────────────────────────────

const spo2Rule: InsightRule = {
  id: 'homepage-spo2',
  appliesTo: [AgentTaskType.HOMEPAGE_SUMMARY],
  evaluate(ctx: AgentContext): InsightSignal[] {
    const records = getRecords(ctx);
    const spo2Values = records
      .map((r) => r.spo2)
      .filter((v): v is number => v !== undefined);
    if (spo2Values.length < 2) return [];

    const avg = average(spo2Values);
    if (avg < 93) {
      return [{
        category: 'anomaly',
        severity: 'critical',
        metric: 'spo2',
        message: `血氧饱和度持续偏低（均值 ${Math.round(avg)}%），建议及时就医`,
      }];
    }
    if (avg < 95) {
      return [{
        category: 'anomaly',
        severity: 'warning',
        metric: 'spo2',
        message: `血氧饱和度略低（均值 ${Math.round(avg)}%），需关注`,
      }];
    }
    return [];
  },
};

// ────────────────────────────────────────────
// 压力规则
// ────────────────────────────────────────────

const stressRule: InsightRule = {
  id: 'homepage-stress',
  appliesTo: [AgentTaskType.HOMEPAGE_SUMMARY],
  evaluate(ctx: AgentContext): InsightSignal[] {
    const records = getRecords(ctx);
    const stressValues = records
      .map((r) => r.stress?.load)
      .filter((v): v is number => v !== undefined);
    if (stressValues.length < 3) return [];

    const avg = average(stressValues);
    if (avg >= 70) {
      return [{
        category: 'anomaly',
        severity: 'warning',
        metric: 'stress',
        message: `压力负荷持续偏高（均值 ${Math.round(avg)}），建议适当休息`,
      }];
    }
    return [];
  },
};

// ────────────────────────────────────────────
// 运动量规则
// ────────────────────────────────────────────

const activityRule: InsightRule = {
  id: 'homepage-activity',
  appliesTo: [AgentTaskType.HOMEPAGE_SUMMARY],
  evaluate(ctx: AgentContext): InsightSignal[] {
    const records = getRecords(ctx);
    const stepsValues = records
      .map((r) => r.activity?.steps)
      .filter((v): v is number => v !== undefined);
    if (stepsValues.length < 3) return [];

    const avg = average(stepsValues);
    if (avg < 4000) {
      return [{
        category: 'suggestion',
        severity: 'info',
        metric: 'activity',
        message: `日均步数 ${Math.round(avg)}，建议增加日常活动量`,
      }];
    }
    return [];
  },
};

// ────────────────────────────────────────────
// 导出
// ────────────────────────────────────────────

export const homepageRules: InsightRule[] = [
  hrvTrendRule,
  sleepRule,
  spo2Rule,
  stressRule,
  activityRule,
];

/** 针对首页场景的一站式评估，包含规则执行 + chart token 建议 */
export function evaluateHomepageRules(ctx: AgentContext): RuleEvaluationResult {
  const engine = new InsightRuleEngine(homepageRules);
  const base = engine.evaluate(ctx);
  return {
    ...base,
    suggestedChartTokens: suggestHomepageTokens(ctx, base.insights),
    suggestedMicroTips: suggestHomepageMicroTips(base.insights),
  };
}

function suggestHomepageTokens(
  ctx: AgentContext,
  insights: InsightSignal[],
): ChartTokenId[] {
  const tokens: ChartTokenId[] = [];
  const metrics = new Set(insights.map((i) => i.metric));

  if (metrics.has('hrv') || metrics.has('stress')) {
    tokens.push(ChartTokenId.HRV_7DAYS);
  }
  if (metrics.has('sleep')) {
    tokens.push(ChartTokenId.SLEEP_7DAYS);
  }
  if (metrics.has('spo2')) {
    tokens.push(ChartTokenId.SPO2_7DAYS);
  }
  if (metrics.has('activity')) {
    tokens.push(ChartTokenId.ACTIVITY_7DAYS);
  }

  // 默认至少推荐 HRV 和睡眠
  if (tokens.length === 0 && ctx.dataWindow.records.length >= 3) {
    tokens.push(ChartTokenId.HRV_7DAYS, ChartTokenId.SLEEP_7DAYS);
  }

  return [...new Set(tokens)];
}

function suggestHomepageMicroTips(insights: InsightSignal[]): string[] {
  return insights
    .filter((i) => i.severity !== 'info')
    .slice(0, 3)
    .map((i) => i.message);
}
