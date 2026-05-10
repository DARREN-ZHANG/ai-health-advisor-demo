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
});
