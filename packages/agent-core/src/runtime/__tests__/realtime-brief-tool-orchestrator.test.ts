import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import type { TaskContextPacket, RecentEventPacket } from '../../context/context-packet';
import type { AgentContext } from '../../types/agent-context';
import type { ToolDefinition, ToolResult } from '../../tools/tool-types';
import {
  appendRealtimeBriefToolEvidenceToPrompt,
  buildRealtimeBriefToolInvocationPlan,
  executeRealtimeBriefToolPlan,
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
    const prompt = appendRealtimeBriefToolEvidenceToPrompt('base prompt', evidence);

    expect(plan.invocations).toHaveLength(1);
    expect(plan.invocations[0]).toMatchObject({
      policyId: 'caffeine-sleep-impact-on-possible-caffeine',
      toolName: 'estimateCaffeineSleepImpact',
      priority: 80,
    });
    expect(evidence.items).toHaveLength(1);
    expect(evidence.items[0]?.status).toBe('success');
    expect(prompt).toContain('## 工具证据包');
    expect(prompt).toContain('estimateCaffeineSleepImpact');
    expect(prompt).toContain('估算咖啡因剩余比例');
    expect(prompt).toContain('不是血液化学实测');
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
