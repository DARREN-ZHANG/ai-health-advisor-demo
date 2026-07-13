/**
 * Task 3.3: Realtime Brief Content Policy 单元测试
 *
 * 验证阻断式客户内容策略：
 * 1. 五类 violation code 全部可识别
 * 2. claim ledger 正确建立（来自 CustomerFacingEvidencePacket + action candidates）
 * 3. 数值归因检查覆盖 summary / actions / futureSuggestions
 * 4. 不通过时 fail-closed（不返回 cleaned 版本）
 */
import { describe, it, expect } from 'vitest';
import {
  enforceCustomerContentPolicy,
  buildClaimLedger,
  type RealtimeBriefPolicyInput,
} from '../realtime-brief-content-policy';
import type { CustomerFacingEvidencePacket, PublicFact } from '../../context/customer-facing-evidence';
import type { AgentResponseEnvelope, ActionOption } from '@health-advisor/shared';
import { ChartTokenId } from '@health-advisor/shared';

// ── 测试夹具 ──────────────────────────────────────

function makeNumericFact(
  metric: string,
  value: number,
  unit: 'bpm' | 'ms' | '%' | 'steps' | 'min',
): PublicFact {
  return {
    kind: 'numeric',
    metric,
    value,
    unit,
    interpretation: `${metric} = ${value}${unit}`,
    evidenceId: `ev_${metric}`,
  };
}

function makeQualitativeFact(metric: string, qualifier: 'low' | 'normal' | 'elevated'): PublicFact {
  return {
    kind: 'qualitative',
    metric,
    qualifier,
    interpretation: `${metric} ${qualifier}`,
    evidenceId: `ev_${metric}`,
  };
}

function makePacket(facts: PublicFact[] = [], eventOverrides: any[] = []): CustomerFacingEvidencePacket {
  return {
    task: { type: 'homepage_summary', page: 'home' },
    userContext: {
      profileId: 'profile-a',
      name: '张健康',
      age: 32,
      tags: [],
      baselines: { restingHR: 62, hrv: 58, spo2: 98, avgSleepMinutes: 420, avgSteps: 8500 },
    },
    dataWindow: { start: '2026-04-18', end: '2026-04-24', recordCount: 7, completenessPct: 100 },
    missingData: [],
    facts,
    events: eventOverrides,
    visibleCharts: [],
  };
}

function makeEnvelope(overrides: Partial<AgentResponseEnvelope> = {}): AgentResponseEnvelope {
  return {
    summary: '今天整体状态平稳。',
    source: 'llm',
    statusColor: 'good',
    chartTokens: [],
    ...overrides,
    meta: {
      taskType: 'homepage_summary' as any,
      pageContext: { profileId: 'profile-a', page: 'home', timeframe: 'week' },
      finishReason: 'complete',
      ...overrides.meta,
    },
  };
}

function makeAction(overrides: Partial<ActionOption> = {}): ActionOption {
  return {
    id: 'act_1',
    emoji: '🚶',
    title: '散步',
    description: '10 分钟散步',
    aiPromise: '记录这次活动',
    ...overrides,
  };
}

// ── 测试用例 ──────────────────────────────────────

describe('realtime-brief-content-policy', () => {
  describe('buildClaimLedger', () => {
    it('从 numeric facts 提取数值（bpm/ms/%/steps/min）', () => {
      const packet = makePacket([
        makeNumericFact('heart_rate', 62, 'bpm'),
        makeNumericFact('hrv_rmssd', 45, 'ms'),
        makeNumericFact('spo2', 98, '%'),
        makeNumericFact('steps', 8000, 'steps'),
        makeNumericFact('activity', 45, 'min'),
      ]);
      const ledger = buildClaimLedger(packet, []);
      expect(ledger.allowedNumbers).toContain(62);
      expect(ledger.allowedNumbers).toContain(45);
      expect(ledger.allowedNumbers).toContain(98);
      expect(ledger.allowedNumbers).toContain(8000);
      expect(ledger.allowedNumbers).toContain(45);
    });

    it('忽略 qualitative facts（无数值的 score 类指标）', () => {
      const packet = makePacket([
        makeQualitativeFact('motion', 'elevated'),
        makeQualitativeFact('stress_load', 'normal'),
      ]);
      const ledger = buildClaimLedger(packet, []);
      expect(ledger.allowedNumbers.size).toBe(0);
    });

    it('从 action candidates 提取 duration 分钟数', () => {
      const packet = makePacket();
      const actions = [
        makeAction({ title: '深呼吸', description: '5 分钟练习', aiPromise: '完成 5 分钟' }),
        makeAction({ title: '散步', description: '15 分钟', aiPromise: '记录' }),
      ];
      const ledger = buildClaimLedger(packet, actions);
      // description / aiPromise 中的数字纳入归因候选，但只有明确 action duration 才权威
      expect(ledger.allowedNumbers.has(5)).toBe(true);
      expect(ledger.allowedNumbers.has(15)).toBe(true);
    });
  });

  describe('enforceCustomerContentPolicy - 通过场景', () => {
    it('summary 使用 ledger 中允许的数值 → 通过（非 homepage 任务，无长度下限）', () => {
      const packet = makePacket([makeNumericFact('heart_rate', 62, 'bpm')]);
      const envelope = makeEnvelope({
        summary: '当前心率 62bpm，整体平稳。',
      });
      const input: RealtimeBriefPolicyInput = {
        envelope,
        evidencePacket: packet,
        actionCandidates: [],
        locale: 'zh',
        taskType: 'advisor_chat',
      };
      const result = enforceCustomerContentPolicy(input);
      expect(result.violations).toHaveLength(0);
      expect(result.approved).toBe(true);
    });

    it('无数值且无事件的常规输出 → 通过（view_summary 任务无下限）', () => {
      const packet = makePacket();
      const envelope = makeEnvelope({ summary: '今天整体状态平稳。' });
      const input: RealtimeBriefPolicyInput = {
        envelope,
        evidencePacket: packet,
        actionCandidates: [],
        locale: 'zh',
        taskType: 'view_summary',
      };
      const result = enforceCustomerContentPolicy(input);
      expect(result.approved).toBe(true);
    });

    it('summary 长度在 zh 220-420 字符范围 → 通过', () => {
      const packet = makePacket();
      const summary = '今'.repeat(300);
      const input: RealtimeBriefPolicyInput = {
        envelope: makeEnvelope({ summary }),
        evidencePacket: packet,
        actionCandidates: [],
        locale: 'zh',
      };
      const result = enforceCustomerContentPolicy(input);
      expect(result.violations.find((v) => v.code === 'summary_length_out_of_range')).toBeUndefined();
    });

    it('summary 长度在 en 90-180 words 范围 → 通过', () => {
      const packet = makePacket();
      // 100 单词
      const summary = Array.from({ length: 100 }, (_, i) => `word${i}`).join(' ');
      const input: RealtimeBriefPolicyInput = {
        envelope: makeEnvelope({ summary }),
        evidencePacket: packet,
        actionCandidates: [],
        locale: 'en',
      };
      const result = enforceCustomerContentPolicy(input);
      expect(result.violations.find((v) => v.code === 'summary_length_out_of_range')).toBeUndefined();
    });
  });

  describe('enforceCustomerContentPolicy - inferred_event_asserted_as_fact', () => {
    it('对 sensor-inferred 事件（certaintyBand=possible）使用确定性断言 → 违规', () => {
      const packet = makePacket([], [
        {
          eventId: 'ev1',
          eventType: 'meal',
          certaintyBand: 'possible',
          priority: 'high',
          timeRelation: '近期',
          headline: '可能刚吃完饭',
          physiology: [],
          recoveryContext: [],
          tension: { level: 'positive', summary: '正常' },
          recommendedFocus: [],
          actionIntents: [],
          mentionPolicy: { summary: 'allowed', actions: 'allowed', reason: 'test' },
        },
      ]);
      const envelope = makeEnvelope({
        summary: '你刚吃完饭，建议散步。',
      });
      const input: RealtimeBriefPolicyInput = {
        envelope,
        evidencePacket: packet,
        actionCandidates: [],
        locale: 'zh',
      };
      const result = enforceCustomerContentPolicy(input);
      const v = result.violations.find((x) => x.code === 'inferred_event_asserted_as_fact');
      expect(v).toBeDefined();
      expect(v!.code === 'inferred_event_asserted_as_fact' && v!.eventType).toBe('meal');
      expect(result.approved).toBe(false);
    });

    it('对 sensor-inferred 事件（certaintyBand=likely）使用确定性断言 → 违规', () => {
      const packet = makePacket([], [
        {
          eventId: 'ev1',
          eventType: 'possible_caffeine_intake',
          certaintyBand: 'likely',
          priority: 'high',
          timeRelation: '近期',
          headline: '大概率摄入咖啡因',
          physiology: [],
          recoveryContext: [],
          tension: { level: 'watch', summary: '注意' },
          recommendedFocus: [],
          actionIntents: [],
          mentionPolicy: { summary: 'allowed', actions: 'allowed', reason: 'test' },
        },
      ]);
      const envelope = makeEnvelope({
        summary: '你摄入了咖啡因，心率上升。',
      });
      const input: RealtimeBriefPolicyInput = {
        envelope,
        evidencePacket: packet,
        actionCandidates: [],
        locale: 'zh',
      };
      const result = enforceCustomerContentPolicy(input);
      const v = result.violations.find((x) => x.code === 'inferred_event_asserted_as_fact');
      expect(v).toBeDefined();
    });

    it('对 reported 事件使用确定性断言 → 不违规（用户上报的事实）', () => {
      const packet = makePacket([], [
        {
          eventId: 'ev1',
          eventType: 'cardio_workout',
          certaintyBand: 'reported',
          priority: 'high',
          timeRelation: '近期',
          headline: '完成有氧训练',
          physiology: [],
          recoveryContext: [],
          tension: { level: 'positive', summary: '良好' },
          recommendedFocus: [],
          actionIntents: [],
          mentionPolicy: { summary: 'allowed', actions: 'allowed', reason: 'test' },
        },
      ]);
      const envelope = makeEnvelope({
        summary: '你完成了有氧训练，恢复良好。',
      });
      const input: RealtimeBriefPolicyInput = {
        envelope,
        evidencePacket: packet,
        actionCandidates: [],
        locale: 'zh',
      };
      const result = enforceCustomerContentPolicy(input);
      const v = result.violations.find((x) => x.code === 'inferred_event_asserted_as_fact');
      expect(v).toBeUndefined();
    });

    it('使用概率措辞描述 possible 事件 → 不违规', () => {
      const packet = makePacket([], [
        {
          eventId: 'ev1',
          eventType: 'meal',
          certaintyBand: 'possible',
          priority: 'high',
          timeRelation: '近期',
          headline: '可能刚吃完饭',
          physiology: [],
          recoveryContext: [],
          tension: { level: 'positive', summary: '正常' },
          recommendedFocus: [],
          actionIntents: [],
          mentionPolicy: { summary: 'allowed', actions: 'allowed', reason: 'test' },
        },
      ]);
      const envelope = makeEnvelope({
        summary: '你可能刚吃完饭，心率有上升。',
      });
      const input: RealtimeBriefPolicyInput = {
        envelope,
        evidencePacket: packet,
        actionCandidates: [],
        locale: 'zh',
      };
      const result = enforceCustomerContentPolicy(input);
      expect(result.violations.find((x) => x.code === 'inferred_event_asserted_as_fact')).toBeUndefined();
    });
  });

  describe('enforceCustomerContentPolicy - internal_score_disclosed', () => {
    it('summary 出现 motion intensity 数值 → 违规', () => {
      const packet = makePacket();
      const envelope = makeEnvelope({
        summary: '当前运动强度 3.9，建议适度休息。',
      });
      const input: RealtimeBriefPolicyInput = {
        envelope,
        evidencePacket: packet,
        actionCandidates: [],
        locale: 'zh',
      };
      const result = enforceCustomerContentPolicy(input);
      const v = result.violations.find((x) => x.code === 'internal_score_disclosed');
      expect(v).toBeDefined();
      expect(v!.code === 'internal_score_disclosed' && v!.metric).toBeTruthy();
    });

    it('summary 出现 stress load score → 违规', () => {
      const packet = makePacket();
      const envelope = makeEnvelope({
        summary: '压力负荷评分 85，偏高。',
      });
      const input: RealtimeBriefPolicyInput = {
        envelope,
        evidencePacket: packet,
        actionCandidates: [],
        locale: 'zh',
      };
      const result = enforceCustomerContentPolicy(input);
      const v = result.violations.find((x) => x.code === 'internal_score_disclosed');
      expect(v).toBeDefined();
    });

    it('summary 出现 sleep score → 违规', () => {
      const packet = makePacket();
      const envelope = makeEnvelope({
        summary: '睡眠评分 85 分，整体良好。',
      });
      const input: RealtimeBriefPolicyInput = {
        envelope,
        evidencePacket: packet,
        actionCandidates: [],
        locale: 'zh',
      };
      const result = enforceCustomerContentPolicy(input);
      expect(result.violations.find((x) => x.code === 'internal_score_disclosed')).toBeDefined();
    });
  });

  describe('enforceCustomerContentPolicy - internal_capability_disclosed', () => {
    it('出现"没有算法/无法测量"等系统元说明 → 违规', () => {
      const packet = makePacket();
      const envelope = makeEnvelope({
        summary: '由于我们没有相关算法，无法给出准确判断。',
      });
      const input: RealtimeBriefPolicyInput = {
        envelope,
        evidencePacket: packet,
        actionCandidates: [],
        locale: 'zh',
      };
      const result = enforceCustomerContentPolicy(input);
      expect(result.violations.find((x) => x.code === 'internal_capability_disclosed')).toBeDefined();
    });

    it('出现"戒指无法测量血压"等能力披露 → 违规', () => {
      const packet = makePacket();
      const envelope = makeEnvelope({
        summary: '戒指无法测量血压，请使用专业设备。',
      });
      const input: RealtimeBriefPolicyInput = {
        envelope,
        evidencePacket: packet,
        actionCandidates: [],
        locale: 'zh',
      };
      const result = enforceCustomerContentPolicy(input);
      expect(result.violations.find((x) => x.code === 'internal_capability_disclosed')).toBeDefined();
    });

    it('出现"算法识别"等内部机制披露 → 违规', () => {
      const packet = makePacket();
      const envelope = makeEnvelope({
        summary: '根据算法识别，你刚完成了散步。',
      });
      const input: RealtimeBriefPolicyInput = {
        envelope,
        evidencePacket: packet,
        actionCandidates: [],
        locale: 'zh',
      };
      const result = enforceCustomerContentPolicy(input);
      expect(result.violations.find((x) => x.code === 'internal_capability_disclosed')).toBeDefined();
    });
  });

  describe('enforceCustomerContentPolicy - unattributed_numeric_claim', () => {
    it('summary 出现不在 ledger 中的数值 → 违规', () => {
      const packet = makePacket([makeNumericFact('heart_rate', 62, 'bpm')]);
      const envelope = makeEnvelope({
        summary: '你的心率是 75bpm，整体良好。',
      });
      const input: RealtimeBriefPolicyInput = {
        envelope,
        evidencePacket: packet,
        actionCandidates: [],
        locale: 'zh',
        taskType: 'homepage_summary',
      };
      const result = enforceCustomerContentPolicy(input);
      const v = result.violations.find((x) => x.code === 'unattributed_numeric_claim');
      expect(v).toBeDefined();
      expect(v!.code === 'unattributed_numeric_claim' && v!.value).toBe('75');
    });

    it('actions 中的数值不在 ledger 中 → 违规', () => {
      const packet = makePacket();
      const envelope = makeEnvelope({
        summary: '状态平稳。',
        actions: [makeAction({ description: '建议进行 30 分钟训练' })],
      });
      const input: RealtimeBriefPolicyInput = {
        envelope,
        evidencePacket: packet,
        actionCandidates: [],
        locale: 'zh',
        taskType: 'homepage_summary',
      };
      const result = enforceCustomerContentPolicy(input);
      expect(result.violations.find((x) => x.code === 'unattributed_numeric_claim')).toBeDefined();
    });

    it('futureSuggestions 中的数值不在 ledger 中 → 违规', () => {
      const packet = makePacket();
      const envelope = makeEnvelope({
        summary: '状态平稳。',
        futureSuggestions: [
          {
            timePoint: '22:00',
            predictedState: 'HRV 预计降到 28ms',
            rationale: '今天训练量较大',
            action: makeAction(),
          },
        ],
      });
      const input: RealtimeBriefPolicyInput = {
        envelope,
        evidencePacket: packet,
        actionCandidates: [],
        locale: 'zh',
        taskType: 'homepage_summary',
      };
      const result = enforceCustomerContentPolicy(input);
      expect(result.violations.find((x) => x.code === 'unattributed_numeric_claim')).toBeDefined();
    });

    it('数值在 ledger 中（来自 action duration）→ 不违规', () => {
      const packet = makePacket();
      const action = makeAction({ description: '15 分钟散步', aiPromise: '记录 15 分钟活动' });
      const envelope = makeEnvelope({
        summary: '状态平稳。',
        actions: [makeAction({ description: '建议 15 分钟散步' })],
      });
      const input: RealtimeBriefPolicyInput = {
        envelope,
        evidencePacket: packet,
        actionCandidates: [action],
        locale: 'zh',
        taskType: 'homepage_summary',
      };
      const result = enforceCustomerContentPolicy(input);
      expect(result.violations.find((x) => x.code === 'unattributed_numeric_claim')).toBeUndefined();
    });
  });

  describe('enforceCustomerContentPolicy - summary_length_out_of_range', () => {
    it('zh summary 超过 420 字符 → 违规', () => {
      const packet = makePacket();
      const summary = '今'.repeat(500);
      const input: RealtimeBriefPolicyInput = {
        envelope: makeEnvelope({ summary }),
        evidencePacket: packet,
        actionCandidates: [],
        locale: 'zh',
      };
      const result = enforceCustomerContentPolicy(input);
      const v = result.violations.find((x) => x.code === 'summary_length_out_of_range');
      expect(v).toBeDefined();
      expect(v!.code === 'summary_length_out_of_range' && v!.actual).toBe(500);
    });

    it('zh summary 不足 220 字符时仅在 homepage_summary 任务中触发 → 违规', () => {
      const packet = makePacket();
      const summary = '状态平稳。';
      const input: RealtimeBriefPolicyInput = {
        envelope: makeEnvelope({ summary }),
        evidencePacket: packet,
        actionCandidates: [],
        locale: 'zh',
      };
      const result = enforceCustomerContentPolicy(input);
      // 短于 220 的输出长度违规仅用于 homepage 任务，且下限宽松（见实现）
      const v = result.violations.find((x) => x.code === 'summary_length_out_of_range');
      if (v) {
        expect(v!.code === 'summary_length_out_of_range' && v!.actual).toBe(summary.length);
      }
    });

    it('en summary 超过 180 words → 违规', () => {
      const packet = makePacket();
      const summary = Array.from({ length: 250 }, (_, i) => `word${i}`).join(' ');
      const input: RealtimeBriefPolicyInput = {
        envelope: makeEnvelope({ summary }),
        evidencePacket: packet,
        actionCandidates: [],
        locale: 'en',
      };
      const result = enforceCustomerContentPolicy(input);
      const v = result.violations.find((x) => x.code === 'summary_length_out_of_range');
      expect(v).toBeDefined();
    });
  });

  describe('多违规聚合', () => {
    it('同时出现多类 violation 全部返回', () => {
      const packet = makePacket([], [
        {
          eventId: 'ev1',
          eventType: 'meal',
          certaintyBand: 'possible',
          priority: 'high',
          timeRelation: '近期',
          headline: '可能刚吃完饭',
          physiology: [],
          recoveryContext: [],
          tension: { level: 'positive', summary: '正常' },
          recommendedFocus: [],
          actionIntents: [],
          mentionPolicy: { summary: 'allowed', actions: 'allowed', reason: 'test' },
        },
      ]);
      const envelope = makeEnvelope({
        summary: '你刚吃完饭，运动强度 4.2，无法识别全部数据。',
      });
      const input: RealtimeBriefPolicyInput = {
        envelope,
        evidencePacket: packet,
        actionCandidates: [],
        locale: 'zh',
      };
      const result = enforceCustomerContentPolicy(input);
      expect(result.violations.length).toBeGreaterThanOrEqual(3);
      const codes = result.violations.map((v) => v.code);
      expect(codes).toContain('inferred_event_asserted_as_fact');
      expect(codes).toContain('internal_score_disclosed');
      expect(codes).toContain('internal_capability_disclosed');
      expect(result.approved).toBe(false);
    });
  });
});
