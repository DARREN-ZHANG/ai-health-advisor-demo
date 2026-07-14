import { describe, expect, it } from 'vitest';
import { renderTaskContextPacket } from '../context-packet-renderer';
import { buildCustomerFacingEvidencePacket } from '../../context/customer-facing-evidence';
import type { TaskContextPacket } from '../../context/context-packet';

describe('context packet renderer knowledge facts', () => {
  it('renders knowledge and product relevant facts in Advisor Chat packet', () => {
    const packet: TaskContextPacket = {
      task: { type: 'advisor_chat', page: 'advisor', userMessage: 'HRV 下降是什么意思？' },
      userContext: {
        profileId: 'profile-a',
        name: '测试用户',
        age: 32,
        tags: [],
        baselines: { restingHR: 60, hrv: 55, spo2: 98, avgSleepMinutes: 420, avgSteps: 8000 },
      },
      dataWindow: { start: '2026-05-01', end: '2026-05-10', recordCount: 10, completenessPct: 100 },
      missingData: [],
      evidence: [
        {
          id: 'knowledge_health-hrv-general-001',
          source: 'knowledge_base',
          metric: 'hrv',
          derivation: 'compiled reviewed health knowledge fact health-hrv-general-001',
        },
        {
          id: 'product_product-sleep-chart-001',
          source: 'knowledge_base',
          metric: 'sleep',
          derivation: 'compiled reviewed product knowledge fact product-sleep-chart-001',
        },
      ],
      visibleCharts: [],
      advisorChat: {
        userMessage: 'HRV 下降是什么意思？',
        questionIntent: {
          metricFocus: ['hrv'],
          timeScope: 'week',
          actionIntent: 'ask_why',
          riskLevel: 'general',
        },
        currentPage: {
          page: 'advisor',
          timeframe: 'week',
          visibleChartTokens: [],
          chartDataSummaries: [],
        },
        relevantFacts: [
          {
            label: '知识: HRV 基础解释',
            factType: 'knowledge',
            summary: 'HRV 可以作为恢复状态参考，但不能单独用于诊断疾病。',
            evidenceIds: ['knowledge_health-hrv-general-001'],
          },
          {
            label: '产品: 睡眠图表说明',
            factType: 'product',
            summary: 'SLEEP_7DAYS 展示最近 7 天睡眠总时长趋势。',
            evidenceIds: ['product_product-sleep-chart-001'],
          },
        ],
        recentConversation: [],
        constraints: [],
      },
    };
    const rendered = renderTaskContextPacket(
      buildCustomerFacingEvidencePacket(packet, 'zh'),
      'zh',
    );

    expect(rendered).toContain('## Reviewed Knowledge Facts');
    expect(rendered).toContain('[knowledge_health-hrv-general-001]');
    expect(rendered).toContain('## Product Facts');
    expect(rendered).toContain('[product_product-sleep-chart-001]');
  });
});
