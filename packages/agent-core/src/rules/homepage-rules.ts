import { ChartTokenId } from '@health-advisor/shared';
import { AgentTaskType } from '@health-advisor/shared';
import type { AgentContext } from '../types/agent-context';
import type { InsightRule, InsightSignal, RuleEvaluationResult } from './types';
import { InsightRuleEngine } from './rule-engine';
import { average, getRecords, computeHrv, computeTrend } from './helpers';

// ────────────────────────────────────────────
// HRV 规则 (趋势 + 绝对值)
// ────────────────────────────────────────────

const hrvRule: InsightRule = {
  id: 'homepage-hrv',
  appliesTo: [AgentTaskType.HOMEPAGE_SUMMARY],
  evaluate(ctx: AgentContext): InsightSignal[] {
    const records = getRecords(ctx);
    const hrValues = records.map((r) => computeHrv(r)).filter(Number.isFinite);
    if (hrValues.length === 0) return [];

    const signals: InsightSignal[] = [];
    const latestHrv = hrValues[hrValues.length - 1];

    // 绝对值极低预警 (临床标准：持续低于 20ms 可能预示过度劳累或急性压力)
    if (latestHrv < 20) {
      signals.push({
        category: 'anomaly',
        severity: 'critical',
        metric: 'hrv',
        message: '心率变异性极低，身体恢复能力严重受阻，建议强制休息',
      });
    }

    // 趋势分析
    if (hrValues.length >= 3) {
      const trend = computeTrend(hrValues);
      if (trend < -0.15) {
        signals.push({
          category: 'anomaly',
          severity: 'warning',
          metric: 'hrv',
          message: '心率变异性显著下降，自主神经调节能力减弱，需关注压力积累',
        });
      } else if (trend > 0.15) {
        signals.push({
          category: 'trend',
          severity: 'info',
          metric: 'hrv',
          message: '心率变异性稳步上升，身体恢复状态良好',
        });
      }
    }

    return signals;
  },
};

// ────────────────────────────────────────────
// 睡眠规则 (时长 + 质量)
// ────────────────────────────────────────────

const sleepRule: InsightRule = {
  id: 'homepage-sleep',
  appliesTo: [AgentTaskType.HOMEPAGE_SUMMARY],
  evaluate(ctx: AgentContext): InsightSignal[] {
    const records = getRecords(ctx);
    const latest = records[records.length - 1];
    if (!latest?.sleep) return [];

    const signals: InsightSignal[] = [];
    const sleepMinutes = latest.sleep.totalMinutes;
    const baseline = ctx.profile.baselines.avgSleepMinutes;

    // 1. 时长判定 (收紧至 75% 预警，符合临床对睡眠剥夺的定义)
    if (sleepMinutes < baseline * 0.6) {
      signals.push({
        category: 'anomaly',
        severity: 'warning',
        metric: 'sleep',
        message: '昨晚睡眠时长严重不足（低于基线 40% 以上），认知能力将受显著影响',
      });
    } else if (sleepMinutes < baseline * 0.75) {
      signals.push({
        category: 'status',
        severity: 'info',
        metric: 'sleep',
        message: '昨晚睡眠不足，建议今日适当补觉或减少高强度工作',
      });
    }

    // 2. 质量判定 (深睡比例 < 15% 视为质量不佳)
    const deepMinutes = (latest.sleep as any).stages?.deep || 0;
    if (sleepMinutes > 0 && (deepMinutes / sleepMinutes) < 0.15) {
      signals.push({
        category: 'anomaly',
        severity: 'warning',
        metric: 'sleep',
        message: '深睡比例偏低（未达 15%），身体修复效果欠佳，晨间可能感到乏力',
      });
    }

    return signals;
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
  hrvRule,
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
