import { describe, expect, it } from 'vitest';
import { verifyOutput } from '../verifier';

describe('knowledge verifier', () => {
  it('passes when knowledge claim has knowledge evidence', () => {
    const report = verifyOutput({
      envelope: {
        source: 'llm',
        statusColor: 'good',
        summary: 'HRV 可以作为恢复状态参考，但不能单独用于诊断疾病。',
        chartTokens: [],
        microTips: [],
        meta: { taskType: 'advisor_chat', finishReason: 'complete' },
      } as never,
      context: {
        task: { type: 'advisor_chat' },
        dataWindow: { missingFields: [] },
      } as never,
      rulesResult: { insights: [], suggestedChartTokens: [], suggestedMicroTips: [], statusColor: 'green' },
      packet: {
        evidence: [
          {
            id: 'knowledge_health-hrv-general-001',
            source: 'knowledge_base',
            metric: 'hrv',
            derivation: 'compiled reviewed health knowledge fact health-hrv-general-001',
          },
        ],
        missingData: [],
        visibleCharts: [],
        advisorChat: {
          relevantFacts: [
            {
              label: '知识: HRV 基础解释',
              factType: 'knowledge',
              summary: 'HRV 可以作为恢复状态参考，但不能单独用于诊断疾病。',
              evidenceIds: ['knowledge_health-hrv-general-001'],
            },
          ],
        },
      } as never,
      parseResult: { success: true },
    });

    expect(report.violations.find((v) => v.ruleId === 'knowledge:claim_without_evidence')?.passed).not.toBe(false);
  });

  it('fails when output contains reviewed knowledge claim without knowledge evidence', () => {
    const report = verifyOutput({
      envelope: {
        source: 'llm',
        statusColor: 'good',
        summary: 'HRV 可以作为恢复状态参考，但不能单独用于诊断疾病。',
        chartTokens: [],
        microTips: [],
        meta: { taskType: 'advisor_chat', finishReason: 'complete' },
      } as never,
      context: {
        task: { type: 'advisor_chat' },
        dataWindow: { missingFields: [] },
      } as never,
      rulesResult: { insights: [], suggestedChartTokens: [], suggestedMicroTips: [], statusColor: 'green' },
      packet: {
        evidence: [],
        missingData: [],
        visibleCharts: [],
        advisorChat: {
          relevantFacts: [
            {
              label: '知识: HRV 基础解释',
              factType: 'knowledge',
              summary: 'HRV 可以作为恢复状态参考，但不能单独用于诊断疾病。',
              evidenceIds: ['knowledge_health-hrv-general-001'],
            },
          ],
        },
      } as never,
      parseResult: { success: true },
    });

    const violation = report.violations.find((v) => v.ruleId === 'knowledge:claim_without_evidence');
    expect(violation?.passed).toBe(false);
    expect(violation?.severity).toBe('hard');
  });
});
