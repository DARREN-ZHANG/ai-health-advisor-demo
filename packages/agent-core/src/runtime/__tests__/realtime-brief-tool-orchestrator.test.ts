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
    type,
    start: '2026-05-19T16:00',
    end: '2026-05-19T18:00',
    durationMin: 120,
    confidence,
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
});
