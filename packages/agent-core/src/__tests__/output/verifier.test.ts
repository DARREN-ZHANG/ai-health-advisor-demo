import { describe, it, expect } from 'vitest';
import type { AgentResponseEnvelope, AgentTaskType, PageContext } from '@health-advisor/shared';
import type { AgentContext } from '../../types/agent-context';
import type { RuleEvaluationResult } from '../../rules/types';
import type { TaskContextPacket } from '../../context/context-packet';
import { verifyOutput } from '../../output/verifier';

// ── 测试夹具 ──────────────────────────────────────────

function makeEnvelope(overrides: Partial<AgentResponseEnvelope> = {}): AgentResponseEnvelope {
  return {
    summary: '您的心率数据显示整体正常。',
    source: 'llm',
    statusColor: 'good',
    chartTokens: [],
    microTips: [],
    meta: {
      taskType: 'homepage_summary' as AgentTaskType,
      pageContext: { profileId: 'p1', page: 'homepage', timeframe: 'day' } as PageContext,
      finishReason: 'complete',
    },
    ...overrides,
  };
}

function makeContext(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    profile: {
      profileId: 'p1',
      name: 'Test',
      age: 30,
      tags: [],
      baselines: { restingHR: 65, hrv: 45, spo2: 97, avgSleepMinutes: 420, avgSteps: 8000 },
    },
    task: {
      type: 'homepage_summary' as AgentTaskType,
      pageContext: { profileId: 'p1', page: 'homepage', timeframe: 'day' } as PageContext,
    },
    dataWindow: {
      start: '2025-01-01',
      end: '2025-01-07',
      records: [],
      missingFields: [],
    },
    signals: {
      overallStatus: 'green',
      anomalies: [],
      trends: [],
      events: [],
      lowData: false,
    },
    memory: { recentMessages: [] },
    locale: 'zh-CN',
    ...overrides,
  };
}

function makeRulesResult(): RuleEvaluationResult {
  return {
    insights: [],
    suggestedChartTokens: [],
    suggestedMicroTips: [],
    statusColor: 'green',
  };
}

function makePacket(overrides: Partial<TaskContextPacket> = {}): TaskContextPacket {
  return {
    task: { type: 'homepage_summary' },
    userContext: { profileId: 'p1', name: 'Test', age: 30, tags: [] },
    dataWindow: { start: '2025-01-01', end: '2025-01-07', recordCount: 7, completeness: 1.0 },
    missingData: [],
    evidence: [],
    visibleCharts: [],
    ...overrides,
  };
}

// ── 测试 ──────────────────────────────────────────────

describe('verifyOutput', () => {
  it('正常输出无 hard violation', () => {
    const report = verifyOutput({
      envelope: makeEnvelope(),
      context: makeContext(),
      rulesResult: makeRulesResult(),
      packet: makePacket(),
      parseResult: { success: true },
    });

    expect(report.summary.hardFailures).toBe(0);
    expect(report.summary.total).toBeGreaterThan(0);
    expect(report.verifiedAt).toBeTruthy();
    expect(report.context.taskType).toBe('homepage_summary');
  });

  it('安全模式命中 → violations 包含对应 ruleId', () => {
    const envelope = makeEnvelope({
      summary: '您已被确诊为高血压，建议服用降压药物治疗。',
    });
    const report = verifyOutput({
      envelope,
      context: makeContext(),
      rulesResult: makeRulesResult(),
      packet: makePacket(),
      parseResult: { success: true },
    });

    const diagnosisViolation = report.violations.find((v) => v.ruleId === 'safety:diagnosis');
    expect(diagnosisViolation).toBeDefined();
    expect(diagnosisViolation!.passed).toBe(false);
    expect(diagnosisViolation!.severity).toBe('hard');

    const medicationViolation = report.violations.find((v) => v.ruleId === 'safety:medication');
    expect(medicationViolation).toBeDefined();
    expect(medicationViolation!.passed).toBe(false);
  });

  it('缺失数据幻觉 → checkMissingDataDisclosure 报告 hard violation', () => {
    const envelope = makeEnvelope({
      summary: '您的心率为 72 bpm，血氧 98%。',
    });
    const context = makeContext({
      dataWindow: {
        start: '2025-01-01',
        end: '2025-01-07',
        records: [],
        missingFields: ['hr', 'spo2'],
      },
    });
    const report = verifyOutput({
      envelope,
      context,
      rulesResult: makeRulesResult(),
      packet: makePacket(),
      parseResult: { success: true },
    });

    const hrViolation = report.violations.find((v) => v.ruleId === 'missing-data:no_claim:hr');
    expect(hrViolation).toBeDefined();
    expect(hrViolation!.passed).toBe(false);
    expect(hrViolation!.severity).toBe('hard');

    const spo2Violation = report.violations.find((v) => v.ruleId === 'missing-data:no_claim:spo2');
    expect(spo2Violation).toBeDefined();
    expect(spo2Violation!.passed).toBe(false);
  });

  it('缺失数据但已披露不足 → disclosure check 通过', () => {
    const envelope = makeEnvelope({
      summary: '当前数据不足，无法对心率进行全面评估。',
    });
    const context = makeContext({
      dataWindow: {
        start: '2025-01-01',
        end: '2025-01-07',
        records: [],
        missingFields: ['hr'],
      },
    });
    const report = verifyOutput({
      envelope,
      context,
      rulesResult: makeRulesResult(),
      packet: makePacket(),
      parseResult: { success: true },
    });

    const disclosure = report.violations.find((v) => v.ruleId === 'missing-data:insufficient_disclosure');
    expect(disclosure).toBeDefined();
    expect(disclosure!.passed).toBe(true);
  });

  it('非法 chart token → checkChartTokens 报告 violation', () => {
    const envelope = makeEnvelope({
      chartTokens: ['INVALID_TOKEN' as any],
    });
    // 设置 visibleCharts 白名单，INVALID_TOKEN 不在白名单中
    const packet = makePacket({
      visibleCharts: [
        { chartToken: 'HRV_7DAYS', metric: 'hrv', timeframe: 'week', visible: true, dataSummary: { avg: 45, trend: 'stable' }, evidenceIds: [] },
      ] as any,
    });
    const report = verifyOutput({
      envelope,
      context: makeContext(),
      rulesResult: makeRulesResult(),
      packet,
      parseResult: { success: true },
    });

    const tokenViolation = report.violations.find((v) => v.ruleId === 'chart_tokens:invalid');
    expect(tokenViolation).toBeDefined();
    expect(tokenViolation!.passed).toBe(false);
  });

  it('critical 状态缺少就医建议 → doctor advice violation', () => {
    const envelope = makeEnvelope({
      summary: '您的心率异常偏高。',
      statusColor: 'error',
    });
    const report = verifyOutput({
      envelope,
      context: makeContext(),
      rulesResult: makeRulesResult(),
      packet: makePacket(),
      parseResult: { success: true },
    });

    const doctorViolation = report.violations.find((v) => v.ruleId === 'safety:doctor_advice_critical');
    expect(doctorViolation).toBeDefined();
    expect(doctorViolation!.passed).toBe(false);
  });

  it('context 快照正确反映输入', () => {
    const context = makeContext({
      dataWindow: {
        start: '2025-01-01',
        end: '2025-01-07',
        records: [],
        missingFields: ['sleep', 'activity'],
      },
    });
    const report = verifyOutput({
      envelope: makeEnvelope(),
      context,
      rulesResult: makeRulesResult(),
      packet: makePacket(),
      parseResult: { success: true },
    });

    expect(report.context.missingData).toEqual(['sleep', 'activity']);
    expect(report.envelope.summary).toBe('您的心率数据显示整体正常。');
  });

  it('summary 字段包含 passed/failed/hardFailures 汇总', () => {
    const report = verifyOutput({
      envelope: makeEnvelope(),
      context: makeContext(),
      rulesResult: makeRulesResult(),
      packet: makePacket(),
      parseResult: { success: true },
    });

    expect(report.summary.total).toBe(report.summary.passed + report.summary.failed);
    expect(report.summary.hardFailures).toBeGreaterThanOrEqual(0);
  });

  // MEDIUM-10 补充覆盖：checkTaskRedlines - homepage 字数红线
  it('homepage summary 超过 500 字 → checkTaskRedlines 报告 soft violation', () => {
    const longSummary = '这是一段很长的健康摘要。'.repeat(50); // 11 * 50 = 550 > 500
    const envelope = makeEnvelope({ summary: longSummary });
    const report = verifyOutput({
      envelope,
      context: makeContext(),
      rulesResult: makeRulesResult(),
      packet: makePacket(),
      parseResult: { success: true },
    });

    const lengthViolation = report.violations.find((v) => v.ruleId === 'task:homepage_length');
    expect(lengthViolation).toBeDefined();
    expect(lengthViolation!.passed).toBe(false);
    expect(lengthViolation!.severity).toBe('soft');
  });

  // MEDIUM-10 补充覆盖：checkTaskRedlines - parse failure
  it('parseResult.success=false → checkTaskRedlines 报告 hard violation', () => {
    const report = verifyOutput({
      envelope: makeEnvelope(),
      context: makeContext(),
      rulesResult: makeRulesResult(),
      packet: makePacket(),
      parseResult: { success: false },
    });

    const parseViolation = report.violations.find((v) => v.ruleId === 'task:parse_failure');
    expect(parseViolation).toBeDefined();
    expect(parseViolation!.passed).toBe(false);
    expect(parseViolation!.severity).toBe('hard');
  });

  // MEDIUM-10 补充覆盖：checkEvidenceConsistency
  it('无证据但有数值声明 → checkEvidenceConsistency 报告 soft violation', () => {
    const envelope = makeEnvelope({
      summary: '您的心率为 72 bpm，血氧 98%，睡眠 7 小时。',
    });
    const report = verifyOutput({
      envelope,
      context: makeContext(),
      rulesResult: makeRulesResult(),
      packet: makePacket({ evidence: [] }),
      parseResult: { success: true },
    });

    const evidenceViolation = report.violations.find((v) => v.ruleId === 'evidence:missing_evidence_for_claims');
    expect(evidenceViolation).toBeDefined();
    expect(evidenceViolation!.passed).toBe(false);
    expect(evidenceViolation!.severity).toBe('soft');
  });

  it('有证据且有数值声明 → checkEvidenceConsistency 通过', () => {
    const envelope = makeEnvelope({
      summary: '您的心率为 72 bpm。',
    });
    const report = verifyOutput({
      envelope,
      context: makeContext(),
      rulesResult: makeRulesResult(),
      packet: makePacket({
        evidence: [{ id: 'ev-1', source: 'daily_records', metric: 'hr', value: 72, unit: 'bpm', derivation: 'latest' }],
      }),
      parseResult: { success: true },
    });

    const evidenceViolation = report.violations.find((v) => v.ruleId === 'evidence:missing_evidence_for_claims');
    expect(evidenceViolation).toBeUndefined();
  });

  it('homepage output containing baseline jargon reports soft violation', () => {
    const report = verifyOutput({
      envelope: makeEnvelope({
        summary: '你的 HRV 低于 baseline，偏离基线明显。',
        actions: [{
          id: 'a1',
          emoji: '🚶',
          title: '要不要轻走一下',
          description: '现在起身轻走 10 分钟',
          aiPromise: '我会记录你的选择并用于本次建议上下文',
        }],
      }),
      context: makeContext(),
      rulesResult: makeRulesResult(),
      packet: makePacket(),
      parseResult: { success: true },
    });

    const violation = report.violations.find((v) => v.ruleId === 'homepage:forbidden_terms');
    expect(violation).toBeDefined();
    expect(violation!.passed).toBe(false);
    expect(violation!.severity).toBe('soft');
  });

  it('homepage action promising unsupported capabilities reports soft violation', () => {
    const report = verifyOutput({
      envelope: makeEnvelope({
        actions: [{
          id: 'a1',
          emoji: '⏰',
          title: '开启提醒',
          description: '我会在 21:00 准时提醒你',
          aiPromise: '我会开启无干扰模式并实时监控你的睡眠',
        }],
      }),
      context: makeContext(),
      rulesResult: makeRulesResult(),
      packet: makePacket(),
      parseResult: { success: true },
    });

    const violation = report.violations.find((v) => v.ruleId === 'homepage:action:unsupported_promise');
    expect(violation).toBeDefined();
    expect(violation!.passed).toBe(false);
  });

  it('homepage llm output with fewer than two actions reports soft violation', () => {
    const report = verifyOutput({
      envelope: makeEnvelope({ actions: [] }),
      context: makeContext(),
      rulesResult: makeRulesResult(),
      packet: makePacket(),
      parseResult: { success: true },
    });

    const violation = report.violations.find((v) => v.ruleId === 'homepage:action:min_count');
    expect(violation).toBeDefined();
    expect(violation!.passed).toBe(false);
  });

  it('homepage forbidden prior-event mention reports hard violation', () => {
    const report = verifyOutput({
      envelope: makeEnvelope({
        summary: '林巅峰，这次运动很好地打断了久坐后的低活跃状态。',
        actions: [{
          id: 'a1',
          emoji: '💧',
          title: '先小口补水',
          description: '现在小口补水，观察心率自然回落',
          aiPromise: '我会记录你的选择并用于本次建议上下文',
        }],
      }),
      context: makeContext(),
      rulesResult: makeRulesResult(),
      packet: makePacket({
        homepage: {
          recentEvents: [],
          latest24h: { date: '2026-06-01', metrics: [] },
          trend7d: [],
          rulesInsights: [],
          suggestedChartTokens: [],
          eventInsights: [
            {
              eventId: 'event_cardio',
              eventType: 'cardio_workout',
              // 对应 RecentEventPacket 为 sensor_inference + 高置信度 → likely
              certaintyBand: 'likely',
              priority: 'high',
              timeRelation: '刚结束约 0 min',
              headline: '完成 30 min 训练，身体进入恢复窗口',
              physiology: [],
              recoveryContext: [],
              tension: { level: 'positive', summary: '事件窗口内没有明显冲突信号', reason: 'test' },
              recommendedFocus: [],
              actionIntents: [],
              mentionPolicy: { summary: 'allowed', actions: 'allowed', reason: 'current_latest_event' },
              transitionContext: {
                currentEventId: 'event_cardio',
                priorEventId: 'event_sedentary',
                priorEventType: 'work_sedentary',
                relation: 'post_sedentary_activation',
                internalFinding: '前一事件提示低活动和静止负荷。',
                allowedUserFacingAngle: '只表达当前运动让身体从低活跃状态重新被带动。',
                forbiddenMentions: ['久坐', '久坐后', '之前', '上一轮'],
                actionSuppressions: [],
              },
              evidenceIds: ['event_cardio'],
            },
            {
              eventId: 'event_sedentary',
              eventType: 'work_sedentary',
              // 对应 RecentEventPacket 为 sensor_inference + 高置信度 → likely
              certaintyBand: 'likely',
              priority: 'medium',
              timeRelation: '约 30 min 前结束',
              headline: '连续静止 240 min，循环和体态需要重置',
              physiology: [],
              recoveryContext: [],
              tension: { level: 'high', summary: '静止负荷累积', reason: 'test' },
              recommendedFocus: [],
              actionIntents: [],
              mentionPolicy: { summary: 'forbidden', actions: 'forbidden', reason: 'prior_event_analysis_only' },
              evidenceIds: ['event_sedentary'],
            },
          ],
        },
      }),
      parseResult: { success: true },
    });

    const violation = report.violations.find((v) => v.ruleId === 'homepage:event_visibility:forbidden_mention');
    expect(violation).toBeDefined();
    expect(violation!.passed).toBe(false);
    expect(violation!.severity).toBe('hard');
    expect(report.summary.hardFailures).toBeGreaterThanOrEqual(1);
  });
});
