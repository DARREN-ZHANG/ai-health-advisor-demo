import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import type { TaskContextPacket, RecentEventPacket } from '../../context/context-packet';
import type { AgentContext } from '../../types/agent-context';
import type { ToolDefinition, ToolResult } from '../../tools/tool-types';
import {
  appendRealtimeBriefToolEvidenceToPrompt,
  buildPublicToolClaimsFromEvidence,
  buildRealtimeBriefToolInvocationPlan,
  executeRealtimeBriefToolPlan,
  projectRealtimeBriefToolEvidenceForPrompt,
  type PublicToolClaim,
  type RealtimeBriefToolTriggerPolicy,
} from '../realtime-brief-tool-orchestrator';

function makeEvent(type: string, confidence = 0.84): RecentEventPacket {
  return {
    recognizedEventId: `re-${type}-1`,
    type,
    start: '2026-05-19T16:00',
    end: '2026-05-19T18:00',
    durationMin: 120,
    confidence,
    // 默认 sensor_inference + confidence 0.84 (≥0.8) → likely；调用方传更低 confidence 时由 toEventCertaintyBand 逻辑应映射到 possible，但此处工厂只产出 fixture 默认值
    certaintyBand: confidence >= 0.8 ? 'likely' : 'possible',
    sourceSegmentId: `seg-${type}-1`,
    recognitionEvidence: ['测试识别证据'],
    syncState: {
      lastSyncedMeasuredAt: '2026-05-19T18:00',
      pendingEventCount: 0,
      fromSyncedWindow: true,
    },
    evidenceIds: [`event-${type}`],
  };
}

function makePacket(events: RecentEventPacket[], taskType = 'homepage_summary'): TaskContextPacket {
  return {
    task: { type: taskType, page: taskType === 'homepage_summary' ? 'home' : 'advisor' },
    userContext: {
      profileId: 'profile-a',
      name: '林巅峰',
      age: 28,
      tags: [],
      baselines: {
        restingHR: 48,
        hrv: 95,
        spo2: 99,
        avgSleepMinutes: 465,
        avgSteps: 12000,
      },
    },
    dataWindow: {
      start: '2026-05-13',
      end: '2026-05-19',
      recordCount: 7,
      completenessPct: 100,
    },
    missingData: [],
    evidence: [],
    visibleCharts: [],
    homepage: {
      recentEvents: events,
      latest24h: { date: '2026-05-19', metrics: [] },
      trend7d: [],
      rulesInsights: [],
      suggestedChartTokens: [],
    },
  };
}

function makeContext(): AgentContext {
  return {
    profile: {
      profileId: 'profile-a',
      name: '林巅峰',
      age: 28,
      tags: [],
      baselines: {
        restingHR: 48,
        hrv: 95,
        spo2: 99,
        avgSleepMinutes: 465,
        avgSteps: 12000,
      },
    },
    task: { type: 'homepage_summary', pageContext: { page: 'home', profileId: 'profile-a' } },
    dataWindow: {
      start: '2026-05-13',
      end: '2026-05-19',
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
    demoNow: '2026-05-19T18:30',
    locale: 'zh',
  } as AgentContext;
}

describe('realtime-brief-tool-orchestrator', () => {
  it('does not plan or execute any tool when no trigger policy matches', async () => {
    const packet = makePacket([makeEvent('exercise')]);
    const context = makeContext();

    const plan = buildRealtimeBriefToolInvocationPlan(packet, context);
    const evidence = await executeRealtimeBriefToolPlan(plan, packet, context);
    const prompt = appendRealtimeBriefToolEvidenceToPrompt('base prompt', evidence);

    expect(plan.invocations).toEqual([]);
    expect(evidence.items).toEqual([]);
    expect(prompt).toBe('base prompt');
  });

  it('plans and executes caffeine sleep impact tool when possible_caffeine_intake exists', async () => {
    const packet = makePacket([makeEvent('possible_caffeine_intake')]);
    const context = makeContext();

    const plan = buildRealtimeBriefToolInvocationPlan(packet, context);
    const evidence = await executeRealtimeBriefToolPlan(plan, packet, context);

    // 内部 evidence item 仍然保留完整 artifact，用于可观测性
    expect(plan.invocations).toHaveLength(1);
    expect(plan.invocations[0]).toMatchObject({
      policyId: 'caffeine-sleep-impact-on-possible-caffeine',
      toolName: 'estimateCaffeineSleepImpact',
      priority: 80,
    });
    expect(evidence.items).toHaveLength(1);
    expect(evidence.items[0]?.status).toBe('success');
  });

  it('does not run realtime brief policies outside homepage_summary', () => {
    const packet = makePacket([makeEvent('possible_caffeine_intake')], 'advisor_chat');
    const plan = buildRealtimeBriefToolInvocationPlan(packet, makeContext());

    expect(plan.invocations).toEqual([]);
  });

  it('supports adding another event-driven tool policy without changing the orchestrator', async () => {
    const exerciseTool: ToolDefinition<{ eventType: string }, { recovery: string }> = {
      name: 'estimateExerciseRecovery',
      description: '估算运动后的恢复建议',
      inputSchema: z.object({ eventType: z.string() }),
      outputSchema: z.object({ recovery: z.string() }),
      async execute(input): Promise<ToolResult<{ recovery: string }>> {
        return {
          success: true,
          data: { recovery: `${input.eventType}: light recovery` },
          evidenceIds: ['event-exercise'],
        };
      },
    };
    const exercisePolicy: RealtimeBriefToolTriggerPolicy = {
      id: 'exercise-recovery-on-exercise',
      toolName: 'estimateExerciseRecovery',
      priority: 60,
      reason: 'exercise event should enrich realtime brief with recovery guidance',
      when: (packet) => (packet.homepage?.recentEvents ?? []).some((event) => event.type === 'exercise'),
      buildInput: () => ({ eventType: 'exercise' }),
    };
    const packet = makePacket([makeEvent('exercise')]);
    const context = makeContext();
    const plan = buildRealtimeBriefToolInvocationPlan(packet, context, [exercisePolicy]);
    const tools = new Map<string, ToolDefinition<unknown, unknown>>([
      [exerciseTool.name, exerciseTool as ToolDefinition<unknown, unknown>],
    ]);

    const evidence = await executeRealtimeBriefToolPlan(plan, packet, context, tools);

    expect(plan.invocations).toHaveLength(1);
    expect(evidence.items[0]).toMatchObject({
      toolName: 'estimateExerciseRecovery',
      status: 'success',
      evidenceIds: ['event-exercise'],
    });
  });

  it('does not plan caffeine sleep impact for alcohol-only probabilistic event', () => {
    const packet = makePacket([makeEvent('possible_alcohol_intake')]);
    const plan = buildRealtimeBriefToolInvocationPlan(packet, makeContext());

    expect(plan.invocations).toEqual([]);
  });

  it('records an error evidence item when a planned tool is not registered', async () => {
    const missingToolPolicy: RealtimeBriefToolTriggerPolicy = {
      id: 'missing-tool-policy',
      toolName: 'missingTool',
      priority: 90,
      reason: 'exercise event maps to a tool that is not registered',
      when: (packet) => (packet.homepage?.recentEvents ?? []).some((event) => event.type === 'exercise'),
      buildInput: () => ({ eventType: 'exercise' }),
    };
    const packet = makePacket([makeEvent('exercise')]);
    const plan = buildRealtimeBriefToolInvocationPlan(packet, makeContext(), [missingToolPolicy]);

    const evidence = await executeRealtimeBriefToolPlan(plan, packet, makeContext(), new Map());

    // 内部 evidence item 仍然记录 error，用于可观测性
    expect(evidence.items).toHaveLength(1);
    expect(evidence.items[0]).toMatchObject({
      toolName: 'missingTool',
      status: 'error',
      error: 'Tool not registered: missingTool',
    });
  });

  it('limits executed tools by maxTools while preserving priority order', async () => {
    const makePolicy = (id: string, toolName: string, priority: number): RealtimeBriefToolTriggerPolicy => ({
      id,
      toolName,
      priority,
      reason: `${toolName} matched`,
      when: () => true,
      buildInput: () => ({}),
    });
    const EmptyInputSchema = z.object({});
    type EmptyInput = z.infer<typeof EmptyInputSchema>;
    const makeTool = (name: string): ToolDefinition<EmptyInput, { name: string }> => ({
      name,
      description: `${name} test tool`,
      inputSchema: EmptyInputSchema,
      outputSchema: z.object({ name: z.string() }),
      async execute(): Promise<ToolResult<{ name: string }>> {
        return { success: true, data: { name }, evidenceIds: [name] };
      },
    });
    const policies = [
      makePolicy('p-low', 'toolLow', 10),
      makePolicy('p-high', 'toolHigh', 90),
      makePolicy('p-mid', 'toolMid', 50),
    ];
    const tools = new Map<string, ToolDefinition<unknown, unknown>>(
      ['toolLow', 'toolHigh', 'toolMid'].map((name) => [
        name,
        makeTool(name) as ToolDefinition<unknown, unknown>,
      ]),
    );
    const packet = makePacket([makeEvent('exercise')]);
    const plan = buildRealtimeBriefToolInvocationPlan(packet, makeContext(), policies);

    const evidence = await executeRealtimeBriefToolPlan(plan, packet, makeContext(), tools, 2);

    expect(plan.invocations.map((invocation) => invocation.toolName)).toEqual(['toolHigh', 'toolMid', 'toolLow']);
    expect(evidence.items.map((item) => item.toolName)).toEqual(['toolHigh', 'toolMid']);
  });
});

// ────────────────────────────────────────────
// Task 3.2：内部执行记录 vs 公开工具结论
// ────────────────────────────────────────────

describe('PublicToolClaim projection (Task 3.2)', () => {
  describe('三种静默状态：不追加任何工具章节', () => {
    it('silent state 1: no invocation produces no public claim and no tool section', async () => {
      const packet = makePacket([makeEvent('exercise')]);
      const context = makeContext();

      const plan = buildRealtimeBriefToolInvocationPlan(packet, context);
      const evidence = await executeRealtimeBriefToolPlan(plan, packet, context);
      const claims = buildPublicToolClaimsFromEvidence(evidence);
      const prompt = appendRealtimeBriefToolEvidenceToPrompt('base prompt', evidence);

      expect(claims).toEqual([]);
      expect(prompt).toBe('base prompt');
    });

    it('silent state 2: tool error produces no public claim and no tool section', async () => {
      const errorToolPolicy: RealtimeBriefToolTriggerPolicy = {
        id: 'error-tool-policy',
        toolName: 'errorTool',
        priority: 90,
        reason: 'matches exercise but tool will error',
        when: (packet) => (packet.homepage?.recentEvents ?? []).some((event) => event.type === 'exercise'),
        buildInput: () => ({}),
      };
      const errorTool: ToolDefinition<{ noop: string }, { result: string }> = {
        name: 'errorTool',
        description: 'throws on execute',
        inputSchema: z.object({ noop: z.string() }),
        outputSchema: z.object({ result: z.string() }),
        async execute(): Promise<ToolResult<{ result: string }>> {
          return {
            success: false,
            error: { code: 'boom', message: 'intentional test failure' },
          };
        },
      };
      const tools = new Map<string, ToolDefinition<unknown, unknown>>([
        [errorTool.name, errorTool as ToolDefinition<unknown, unknown>],
      ]);
      const packet = makePacket([makeEvent('exercise')]);
      const plan = buildRealtimeBriefToolInvocationPlan(packet, makeContext(), [errorToolPolicy]);

      const evidence = await executeRealtimeBriefToolPlan(plan, packet, makeContext(), tools);
      const claims = buildPublicToolClaimsFromEvidence(evidence);
      const prompt = appendRealtimeBriefToolEvidenceToPrompt('base prompt', evidence);

      // 内部 evidence item 保留 error artifact 用于可观测性
      expect(evidence.items).toHaveLength(1);
      expect(evidence.items[0]?.status).toBe('error');
      // 公开侧完全静默
      expect(claims).toEqual([]);
      expect(prompt).toBe('base prompt');
    });

    it('silent state 3: tool success without usable data (no caffeine event) produces no public claim and no tool section', async () => {
      // 没有 possible_caffeine_intake 事件，caffeine 工具不会触发；
      // 构造一个 success-without-data 的直接路径：policy 匹配但 caffeine 工具返回 hasCaffeineEvent=false
      // 这里通过使用一个泛型 success-without-data 工具模拟
      const emptySuccessPolicy: RealtimeBriefToolTriggerPolicy = {
        id: 'empty-success-policy',
        toolName: 'emptySuccessTool',
        priority: 50,
        reason: 'matches exercise but tool returns empty',
        when: (packet) => (packet.homepage?.recentEvents ?? []).some((event) => event.type === 'exercise'),
        buildInput: () => ({}),
      };
      // caffeine 工具在没有 possible_caffeine_intake 时返回 hasCaffeineEvent: false
      // 这里复用同形态：success 但无可用 claim
      const emptySuccessTool: ToolDefinition<Record<string, never>, { hasCaffeineEvent: boolean }> = {
        name: 'emptySuccessTool',
        description: 'succeeds but no usable claim',
        inputSchema: z.object({}),
        outputSchema: z.object({ hasCaffeineEvent: z.boolean() }),
        async execute(): Promise<ToolResult<{ hasCaffeineEvent: boolean }>> {
          return { success: true, data: { hasCaffeineEvent: false }, evidenceIds: [] };
        },
      };
      const tools = new Map<string, ToolDefinition<unknown, unknown>>([
        [emptySuccessTool.name, emptySuccessTool as ToolDefinition<unknown, unknown>],
      ]);
      const packet = makePacket([makeEvent('exercise')]);
      const plan = buildRealtimeBriefToolInvocationPlan(packet, makeContext(), [emptySuccessPolicy]);

      const evidence = await executeRealtimeBriefToolPlan(plan, packet, makeContext(), tools);
      const claims = buildPublicToolClaimsFromEvidence(evidence);
      const prompt = appendRealtimeBriefToolEvidenceToPrompt('base prompt', evidence);

      // 内部 evidence item 保留 success artifact 用于可观测性
      expect(evidence.items).toHaveLength(1);
      expect(evidence.items[0]?.status).toBe('success');
      // 公开侧完全静默（success-without-data 不产出 claim）
      expect(claims).toEqual([]);
      expect(prompt).toBe('base prompt');
    });
  });

  describe('success with data：只追加 PublicToolClaim.summary', () => {
    it('produces a single public claim with customer-safe summary when caffeine tool returns data', async () => {
      const packet = makePacket([makeEvent('possible_caffeine_intake')]);
      const context = makeContext();

      const plan = buildRealtimeBriefToolInvocationPlan(packet, context);
      const evidence = await executeRealtimeBriefToolPlan(plan, packet, context);
      const claims = buildPublicToolClaimsFromEvidence(evidence);

      expect(claims).toHaveLength(1);
      const claim = claims[0] as PublicToolClaim;
      expect(claim.kind).toBe('estimated_caffeine_sleep_impact');
      expect(claim.claimId).toBeTruthy();
      // summary 是客户可见的唯一字段
      expect(typeof claim.summary).toBe('string');
      expect(claim.summary.length).toBeGreaterThan(0);
      // evidenceIds 用于 traceability
      expect(Array.isArray(claim.evidenceIds)).toBe(true);
    });

    it('renders only PublicToolClaim.summary into prompt, no tool metadata', async () => {
      const packet = makePacket([makeEvent('possible_caffeine_intake')]);
      const context = makeContext();

      const plan = buildRealtimeBriefToolInvocationPlan(packet, context);
      const evidence = await executeRealtimeBriefToolPlan(plan, packet, context);
      const claims = buildPublicToolClaimsFromEvidence(evidence);
      const prompt = projectRealtimeBriefToolEvidenceForPrompt('base prompt', claims);

      // 有 claim 时会追加一个工具章节，但只包含 summary
      expect(prompt).not.toBe('base prompt');
      // 章节标题使用客户语言，不出现 toolName
      expect(prompt).toContain('## 工具结论');
      // 不出现 toolName、policyId、reason、status 等内部字段
      expect(prompt).not.toContain('estimateCaffeineSleepImpact');
      expect(prompt).not.toContain('policyId');
      expect(prompt).not.toContain('priority');
      expect(prompt).not.toContain('status:');
      expect(prompt).not.toContain('reason:');
      // 不出现半衰期/eliminationRateK 常量
      expect(prompt).not.toContain('halfLifeHours');
      expect(prompt).not.toContain('eliminationRateK');
      expect(prompt).not.toContain('measuredChemically');
      // 不出现 "没有算法"/"无法估算"/"tool failed" 等元说明
      expect(prompt).not.toContain('没有算法');
      expect(prompt).not.toContain('无法估算');
      expect(prompt).not.toContain('tool failed');
      // 文案使用"估算"表达概率性
      expect(prompt).toContain('估算');
    });

    it('appendRealtimeBriefToolEvidenceToPrompt (back-compat entry) also stays silent on errors', async () => {
      const errorToolPolicy: RealtimeBriefToolTriggerPolicy = {
        id: 'error-tool-policy',
        toolName: 'errorTool',
        priority: 90,
        reason: 'matches exercise but tool will error',
        when: (packet) => (packet.homepage?.recentEvents ?? []).some((event) => event.type === 'exercise'),
        buildInput: () => ({}),
      };
      const errorTool: ToolDefinition<{ noop: string }, { result: string }> = {
        name: 'errorTool',
        description: 'throws on execute',
        inputSchema: z.object({ noop: z.string() }),
        outputSchema: z.object({ result: z.string() }),
        async execute(): Promise<ToolResult<{ result: string }>> {
          return {
            success: false,
            error: { code: 'boom', message: 'intentional test failure' },
          };
        },
      };
      const tools = new Map<string, ToolDefinition<unknown, unknown>>([
        [errorTool.name, errorTool as ToolDefinition<unknown, unknown>],
      ]);
      const packet = makePacket([makeEvent('exercise')]);
      const plan = buildRealtimeBriefToolInvocationPlan(packet, makeContext(), [errorToolPolicy]);
      const evidence = await executeRealtimeBriefToolPlan(plan, packet, makeContext(), tools);

      const prompt = appendRealtimeBriefToolEvidenceToPrompt('base prompt', evidence);
      expect(prompt).toBe('base prompt');
    });
  });

  describe('回归测试：客户输出不得出现元说明', () => {
    const FORBIDDEN_PHRASES = [
      '没有算法',
      '无法估算剩余比例',
      'ring cannot determine',
      'ring cannot measure',
      'tool failed',
      'estimateCaffeineSleepImpact',
      'policyId',
      'caffeine-sleep-impact-on-possible-caffeine',
      'measuredChemically',
      'halfLifeHours',
      'eliminationRateK',
      'physiological_proxy',
    ];

    it('success with data prompt contains none of the forbidden meta-explanations', async () => {
      const packet = makePacket([makeEvent('possible_caffeine_intake')]);
      const context = makeContext();
      const plan = buildRealtimeBriefToolInvocationPlan(packet, context);
      const evidence = await executeRealtimeBriefToolPlan(plan, packet, context);
      const claims = buildPublicToolClaimsFromEvidence(evidence);
      const prompt = projectRealtimeBriefToolEvidenceForPrompt('base prompt', claims);

      for (const phrase of FORBIDDEN_PHRASES) {
        expect(prompt).not.toContain(phrase);
      }
    });

    it('PublicToolClaim type carries no internal fields', async () => {
      const packet = makePacket([makeEvent('possible_caffeine_intake')]);
      const context = makeContext();
      const plan = buildRealtimeBriefToolInvocationPlan(packet, context);
      const evidence = await executeRealtimeBriefToolPlan(plan, packet, context);
      const claims = buildPublicToolClaimsFromEvidence(evidence);
      const claim = claims[0] as PublicToolClaim;

      const claimKeys = Object.keys(claim).sort();
      expect(claimKeys).toEqual(['claimId', 'evidenceIds', 'kind', 'summary'].sort());
    });
  });
});
