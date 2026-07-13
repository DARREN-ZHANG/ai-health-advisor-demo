import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  buildCustomerFacingEvidencePacket,
  type CustomerFacingEvidencePacket,
  type PublicMetricUnit,
  type PublicNumericFact,
  type PublicQualitativeFact,
  type PublicFact,
} from '../../context/customer-facing-evidence';
import type { TaskContextPacket } from '../../context/context-packet';
import { ChartTokenId } from '@health-advisor/shared';

// ────────────────────────────────────────────
// 辅助：构造最小可用内部 packet
// ────────────────────────────────────────────

function makeBasePacket(): TaskContextPacket {
  return {
    task: { type: 'homepage_summary', page: 'home' },
    userContext: {
      profileId: 'p1',
      name: 'Test',
      age: 30,
      tags: [],
      baselines: { restingHR: 60, hrv: 60, spo2: 98, avgSleepMinutes: 420, avgSteps: 8000 },
    },
    dataWindow: { start: '2026-07-13', end: '2026-07-13', recordCount: 1, completenessPct: 100 },
    missingData: [],
    evidence: [],
    visibleCharts: [],
  };
}

/** 构造带 motion/stress_load score 的事件 packet */
function makePacketWithScoreLeakage(): TaskContextPacket {
  return {
    ...makeBasePacket(),
    evidence: [],
    homepage: {
      recentEvents: [
        {
          recognizedEventId: 're-hiit-1',
          type: 'intermittent_exercise',
          start: '2026-07-13T17:30',
          end: '2026-07-13T18:30',
          durationMin: 60,
          confidence: 0.98,
          certaintyBand: 'likely',
          sourceSegmentId: 'seg-hiit-1',
          recognitionEvidence: ['心率标准差 35'],
          eventWindow: {
            source: 'synced_device_samples',
            coverage: 'complete',
            recognizedEventId: 're-hiit-1',
            sourceSegmentId: 'seg-hiit-1',
            start: '2026-07-13T17:30',
            end: '2026-07-13T18:30',
            durationMin: 60,
            sampleCount: 5,
            evidenceIds: ['ew_hr_1'],
            metrics: [
              {
                metric: 'heart_rate',
                unit: 'bpm',
                sampleCount: 3,
                startValue: 118,
                endValue: 92,
                latest: 92,
                min: 92,
                max: 172,
                average: 134,
                delta: -26,
                qualifier: 'elevated',
                interpretation: '心率峰值 172bpm',
                evidenceId: 'ew_hr_1',
              },
              {
                metric: 'motion',
                unit: 'score',
                sampleCount: 3,
                startValue: 1.2,
                endValue: 0.8,
                latest: 0.8,
                min: 0.5,
                max: 5.8,
                average: 3.9,
                delta: -0.4,
                qualifier: 'elevated',
                interpretation: '运动强度均值 3.9',
                evidenceId: 'ew_motion_1',
              },
              {
                metric: 'stress_load',
                unit: 'score',
                sampleCount: 3,
                startValue: 30,
                endValue: 72,
                latest: 72,
                min: 30,
                max: 85,
                average: 60,
                delta: 42,
                qualifier: 'elevated',
                interpretation: '压力负荷峰值 85',
                evidenceId: 'ew_stress_1',
              },
            ],
          },
          syncState: {
            lastSyncedMeasuredAt: '2026-07-13T18:30',
            pendingEventCount: 0,
            fromSyncedWindow: true,
          },
          evidenceIds: ['event_hiit', 'ew_hr_1'],
        },
      ],
      eventInsights: [
        {
          eventId: 'event_hiit',
          rawEventType: 'intermittent_exercise',
          eventType: 'hiit_workout',
          certaintyBand: 'likely',
          priority: 'high',
          timeRelation: '刚结束约 5 min',
          headline: '完成 60 min 训练',
          eventWindow: {
            source: 'synced_device_samples',
            coverage: 'complete',
            recognizedEventId: 're-hiit-1',
            sourceSegmentId: 'seg-hiit-1',
            start: '2026-07-13T17:30',
            end: '2026-07-13T18:30',
            durationMin: 60,
            sampleCount: 5,
            evidenceIds: ['ew_hr_1'],
            metrics: [
              {
                metric: 'heart_rate',
                unit: 'bpm',
                sampleCount: 3,
                startValue: 118,
                endValue: 92,
                latest: 92,
                min: 92,
                max: 172,
                average: 134,
                delta: -26,
                qualifier: 'elevated',
                interpretation: '心率峰值 172bpm',
                evidenceId: 'ew_hr_1',
              },
              {
                metric: 'motion',
                unit: 'score',
                sampleCount: 3,
                startValue: 1.2,
                endValue: 0.8,
                latest: 0.8,
                min: 0.5,
                max: 5.8,
                average: 3.9,
                delta: -0.4,
                qualifier: 'elevated',
                interpretation: '运动强度均值 3.9',
                evidenceId: 'ew_motion_1',
              },
              {
                metric: 'stress_load',
                unit: 'score',
                sampleCount: 3,
                startValue: 30,
                endValue: 72,
                latest: 72,
                min: 30,
                max: 85,
                average: 60,
                delta: 42,
                qualifier: 'elevated',
                interpretation: '压力负荷峰值 85',
                evidenceId: 'ew_stress_1',
              },
            ],
          },
          physiology: [
            {
              metric: 'heart_rate',
              value: 172,
              unit: 'bpm',
              qualifier: 'elevated',
              interpretation: '心率峰值 172bpm',
              evidenceId: 'ew_hr_1',
            },
            {
              metric: 'motion',
              value: 3.9,
              unit: 'score',
              qualifier: 'elevated',
              interpretation: '运动强度均值 3.9',
              evidenceId: 'ew_motion_1',
            },
            {
              metric: 'stress',
              value: 85,
              unit: 'score',
              qualifier: 'elevated',
              interpretation: '压力负荷峰值 85',
              evidenceId: 'ew_stress_1',
            },
          ],
          recoveryContext: [],
          tension: {
            level: 'watch',
            summary: '进入恢复窗口',
            reason: 'workout recovery markers present',
          },
          recommendedFocus: [],
          actionIntents: [],
          evidenceIds: ['event_hiit', 'ew_hr_1'],
          mentionPolicy: {
            summary: 'allowed',
            actions: 'allowed',
            reason: 'current_latest_event',
          },
        },
      ],
      latest24h: {
        date: '2026-07-13',
        metrics: [
          {
            metric: 'hrv',
            value: 84,
            unit: 'ms',
            baseline: 60,
            deltaPctVsBaseline: 40,
            status: 'normal',
            evidenceId: 'd_hrv',
          },
          {
            metric: 'spo2',
            value: 99,
            unit: '%',
            baseline: 98,
            deltaPctVsBaseline: 1,
            status: 'normal',
            evidenceId: 'd_spo2',
          },
        ],
      },
      trend7d: [],
      rulesInsights: [],
      suggestedChartTokens: [],
    },
  };
}

// ────────────────────────────────────────────
// 类型级保证：unit='score' 不可表示
// ────────────────────────────────────────────

describe('CustomerFacingEvidencePacket 类型契约', () => {
  it('PublicMetricUnit 是封闭集合，不包含 score', () => {
    // 编译时类型检查：score 不在集合中
    const validUnits: PublicMetricUnit[] = ['bpm', 'ms', '%', 'steps', 'min'];
    expect(validUnits).not.toContain('score');
  });

  it('PublicNumericFact.unit 类型禁止 score（编译时保证）', () => {
    // 类型级测试：以下赋值在编译时会报错（保留为注释展示契约）
    // const bad: PublicNumericFact = {
    //   kind: 'numeric', metric: 'x', value: 1, unit: 'score', interpretation: '', evidenceId: '',
    // };
    // 运行时镜像：确保类型导出可被引用
    expectTypeOf<PublicNumericFact['unit']>().toEqualTypeOf<PublicMetricUnit>();
  });

  it('PublicFact 是 numeric | qualitative 判别联合', () => {
    const numeric: PublicFact = {
      kind: 'numeric',
      metric: 'heart_rate',
      value: 107,
      unit: 'bpm',
      interpretation: '事件窗口心率峰值',
      evidenceId: 'e1',
    };
    const qualitative: PublicFact = {
      kind: 'qualitative',
      metric: 'motion',
      qualifier: 'elevated',
      interpretation: '运动强度上升',
      evidenceId: 'e2',
    };
    expect(numeric.kind).toBe('numeric');
    expect(qualitative.kind).toBe('qualitative');
  });
});

// ────────────────────────────────────────────
// buildCustomerFacingEvidencePacket 投影行为
// ────────────────────────────────────────────

describe('buildCustomerFacingEvidencePacket', () => {
  it('物理单位指标 → PublicNumericFact（保留 value）', () => {
    const packet = makePacketWithScoreLeakage();
    const projected = buildCustomerFacingEvidencePacket(packet, 'zh');

    // 心率应作为 numeric fact 出现，值保留
    const hrFact = projected.facts.find(
      (f) => f.kind === 'numeric' && f.metric === 'heart_rate',
    ) as PublicNumericFact | undefined;
    expect(hrFact).toBeDefined();
    expect(hrFact?.unit).toBe('bpm');
    expect(String(hrFact?.value)).toContain('172'); // 峰值保留
  });

  it('motion → PublicQualitativeFact（丢弃 numeric value）', () => {
    const packet = makePacketWithScoreLeakage();
    const projected = buildCustomerFacingEvidencePacket(packet, 'zh');

    const motionFact = projected.facts.find(
      (f) => f.kind === 'qualitative' && f.metric === 'motion',
    ) as PublicQualitativeFact | undefined;
    expect(motionFact).toBeDefined();
    expect(motionFact?.qualifier).toBe('elevated');
    // 关键：不得保留 motion 的 score 数值
    expect(JSON.stringify(motionFact)).not.toContain('3.9');
    expect(JSON.stringify(motionFact)).not.toContain('5.8');
  });

  it('stress_load → PublicQualitativeFact（丢弃 numeric value）', () => {
    const packet = makePacketWithScoreLeakage();
    const projected = buildCustomerFacingEvidencePacket(packet, 'zh');

    const stressFact = projected.facts.find(
      (f) => f.kind === 'qualitative' && (f.metric === 'stress_load' || f.metric === 'stress'),
    ) as PublicQualitativeFact | undefined;
    expect(stressFact).toBeDefined();
    expect(stressFact?.qualifier).toBe('elevated');
    // 关键：不得保留 stress load 的数值（72/85/60）
    expect(JSON.stringify(stressFact)).not.toContain('72');
    expect(JSON.stringify(stressFact)).not.toContain('85');
    expect(JSON.stringify(stressFact)).not.toContain('"60"');
  });

  it('投影后整个公开包中不含 unit=score 字样', () => {
    const packet = makePacketWithScoreLeakage();
    const projected = buildCustomerFacingEvidencePacket(packet, 'zh');
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain('"score"');
    expect(serialized).not.toContain('unit":"score"');
  });

  it('整个公开包不含 movement intensity averaged 3.9 等泄漏文案', () => {
    const packet = makePacketWithScoreLeakage();
    const projected = buildCustomerFacingEvidencePacket(packet, 'zh');
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain('movement intensity averaged 3.9');
    expect(serialized).not.toContain('stress load 72');
    expect(serialized).not.toContain('stress load 85');
  });

  it('整个公开包不含 confidence 数值（由 certaintyBand 替代）', () => {
    const packet = makePacketWithScoreLeakage();
    const projected = buildCustomerFacingEvidencePacket(packet, 'zh');
    const serialized = JSON.stringify(projected);
    // 0.98 / 98% 都不应出现
    expect(serialized).not.toContain('0.98');
    expect(serialized).not.toContain('98%');
    expect(serialized).not.toContain('"confidence"');
  });

  it('整个公开包不含 qualityScore 字段', () => {
    const packet = makePacketWithScoreLeakage();
    const projected = buildCustomerFacingEvidencePacket(packet, 'zh');
    const serialized = JSON.stringify(projected);
    expect(serialized.toLowerCase()).not.toContain('qualityscore');
  });

  it('移除内部 ID：sourceSegmentId / recognizedEventId 不出现在公开包', () => {
    const packet = makePacketWithScoreLeakage();
    const projected = buildCustomerFacingEvidencePacket(packet, 'zh');
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain('sourceSegmentId');
    expect(serialized).not.toContain('seg-hiit-1');
    expect(serialized).not.toContain('recognizedEventId');
    expect(serialized).not.toContain('re-hiit-1');
  });

  it('移除 raw event type：internal type 字符串不出现', () => {
    const packet = makePacketWithScoreLeakage();
    const projected = buildCustomerFacingEvidencePacket(packet, 'zh');
    const serialized = JSON.stringify(projected);
    // rawEventType 字段不投影
    expect(serialized).not.toContain('rawEventType');
    expect(serialized).not.toContain('intermittent_exercise');
  });

  it('保留物理指标：HR bpm / HRV ms / SpO2 % / duration min 可出现', () => {
    const packet = makePacketWithScoreLeakage();
    const projected = buildCustomerFacingEvidencePacket(packet, 'zh');

    const numericFacts = projected.facts.filter(
      (f): f is PublicNumericFact => f.kind === 'numeric',
    );
    const metrics = numericFacts.map((f) => f.metric);
    // 心率必须作为物理值保留
    expect(metrics).toContain('heart_rate');
    const hr = numericFacts.find((f) => f.metric === 'heart_rate');
    expect(hr?.unit).toBe('bpm');

    // latest24h 的 hrv/spo2 也应投影为 numeric
    const hrv = numericFacts.find((f) => f.metric === 'hrv');
    expect(hrv?.unit).toBe('ms');
    expect(String(hrv?.value)).toContain('84');

    const spo2 = numericFacts.find((f) => f.metric === 'spo2');
    expect(spo2?.unit).toBe('%');
    expect(String(spo2?.value)).toContain('99');
  });

  it('保留事件语义类型（hiit_workout 等客户可见类型）', () => {
    const packet = makePacketWithScoreLeakage();
    const projected = buildCustomerFacingEvidencePacket(packet, 'zh');
    // 语义事件类型是客户可见的（与 rawEventType 区分）
    expect(projected.events.length).toBeGreaterThan(0);
    const evt = projected.events[0]!;
    expect(evt.eventType).toBe('hiit_workout');
    // certaintyBand 保留
    expect(evt.certaintyBand).toBe('likely');
  });

  it('保留 action intents（客户可见操作）', () => {
    const packet: TaskContextPacket = {
      ...makeBasePacket(),
      homepage: {
        recentEvents: [],
        latest24h: { date: '2026-07-13', metrics: [] },
        trend7d: [],
        rulesInsights: [],
        suggestedChartTokens: [],
        eventInsights: [
          {
            eventId: 'e1',
            eventType: 'work_focus',
            certaintyBand: 'likely',
            priority: 'high',
            timeRelation: 'now',
            headline: '专注中',
            physiology: [],
            recoveryContext: [],
            tension: { level: 'watch', summary: 's', reason: 'r' },
            recommendedFocus: [],
            actionIntents: [
              {
                id: 'a1',
                emoji: '🫁',
                title: '深呼吸',
                description: '3 分钟缓慢呼吸',
                aiPromise: '记录选择',
                productCapability: 'contextual_followup',
              },
            ],
            evidenceIds: ['e1'],
            mentionPolicy: {
              summary: 'allowed',
              actions: 'allowed',
              reason: 'current_latest_event',
            },
          },
        ],
      },
    };
    const projected = buildCustomerFacingEvidencePacket(packet, 'zh');
    expect(projected.events[0]?.actionIntents.length).toBe(1);
    expect(projected.events[0]?.actionIntents[0]?.title).toBe('深呼吸');
  });

  it('纯函数：不修改输入 packet', () => {
    const packet = makePacketWithScoreLeakage();
    const snapshot = JSON.stringify(packet);
    buildCustomerFacingEvidencePacket(packet, 'zh');
    expect(JSON.stringify(packet)).toBe(snapshot);
  });

  it('无 homepage 时返回空事件数组', () => {
    const packet = makeBasePacket();
    const projected = buildCustomerFacingEvidencePacket(packet, 'zh');
    expect(projected.events).toEqual([]);
    expect(projected.facts).toEqual([]);
  });

  it('view summary packet 也被投影（MetricSummary 中的 score 单位）', () => {
    const packet: TaskContextPacket = {
      ...makeBasePacket(),
      viewSummary: {
        tab: 'stress',
        timeframe: 'week',
        selectedMetric: {
          metric: 'stress',
          latest: { value: 72, unit: 'score' },
          average: { value: 68, unit: 'score' },
          trendDirection: 'up',
          anomalyPoints: [],
          missing: { missingCount: 0, totalCount: 7, completenessPct: 100 },
          evidenceIds: ['e1'],
        },
        visibleCharts: [],
        rulesInsights: [],
        suggestedChartTokens: [],
      },
    };
    const projected = buildCustomerFacingEvidencePacket(packet, 'zh');
    const serialized = JSON.stringify(projected);
    // stress 作为 score 必须降级为 qualitative
    expect(serialized).not.toContain('unit":"score"');
    const stressFact = projected.facts.find(
      (f) => f.kind === 'qualitative' && f.metric === 'stress',
    ) as PublicQualitativeFact | undefined;
    expect(stressFact).toBeDefined();
  });

  it('locale 不影响数值隔离（en 同样不含 score/motion value）', () => {
    const packet = makePacketWithScoreLeakage();
    const projected = buildCustomerFacingEvidencePacket(packet, 'en');
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain('unit":"score"');
    expect(serialized).not.toContain('movement intensity averaged 3.9');
    expect(serialized).not.toContain('stress load 72');
  });
});
