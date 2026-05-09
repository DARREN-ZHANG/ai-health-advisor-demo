import { describe, it, expect, vi } from 'vitest';
import { runConstrainedReAct } from '../react-loop';
import type { ReActLoopDeps, ReActLoopInput } from '../react-loop';
import type { HealthAgent } from '../create-agent';
import type { ToolDefinition, ToolExecutionContext, ToolResult } from '../../tools/tool-types';
import type { AnalysisPlan } from '../../planner/analysis-plan';
import type { TaskContextPacket } from '../../context/context-packet';
import type { AgentContext } from '../../types/agent-context';

/** 构造 mock ToolDefinition */
function createMockTool(
  name: string,
  executeFn: (input: unknown, ctx: ToolExecutionContext) => Promise<ToolResult<unknown>>,
): ToolDefinition<unknown, unknown> {
  return {
    name,
    description: `Mock tool: ${name}`,
    inputSchema: {} as any,
    outputSchema: {} as any,
    execute: executeFn,
  };
}

/** 构造 mock plannerAgent */
function createMockAgent(responses: string[]): HealthAgent {
  const mockInvoke = vi.fn();
  responses.forEach((r, i) => {
    mockInvoke.mockResolvedValueOnce({ content: r });
  });
  return { invoke: mockInvoke } as unknown as HealthAgent;
}

/** 构造 ToolExecutionContext */
function createMockContext(): ToolExecutionContext {
  return {
    packet: {} as TaskContextPacket,
    context: {} as AgentContext,
  };
}

/** 构造 evidence need */
function createNeed(metric: string, required = true): AnalysisPlan['evidenceNeeds'][number] {
  return {
    metric: metric as any,
    timeScope: 'week',
    reason: `需要 ${metric} 数据`,
    required,
  };
}

/** 构造成功的 tool call JSON */
function toolCallJson(toolName: string, input: Record<string, unknown> = {}): string {
  return JSON.stringify({ toolName, input });
}

/** 构造 deps */
function createDeps(agent: HealthAgent, tools: Map<string, ToolDefinition<unknown, unknown>>): ReActLoopDeps {
  return {
    plannerAgent: agent,
    tools,
    reactPrompt: '你是工具选择器。',
  };
}

/** 构造 input */
function createInput(needs: AnalysisPlan['evidenceNeeds'], maxSteps = 3): ReActLoopInput {
  return {
    unresolvedNeeds: needs,
    context: createMockContext(),
    maxSteps,
  };
}

// ────────────────────────────────────────────
// 测试
// ────────────────────────────────────────────

describe('runConstrainedReAct', () => {
  describe('全部满足', () => {
    it('每次 tool 调用成功 → stillUnresolved: false', async () => {
      const toolA = createMockTool('queryMetricSummary', async () => ({
        success: true,
        data: { metric: 'hrv', latest: 48 },
        evidenceIds: ['ev-hrv-1'],
      }));
      const toolB = createMockTool('queryVisibleChartFacts', async () => ({
        success: true,
        data: { metric: 'sleep', latest: 420 },
        evidenceIds: ['ev-sleep-1'],
      }));

      const tools = new Map([
        ['queryMetricSummary', toolA],
        ['queryVisibleChartFacts', toolB],
      ]);

      const agent = createMockAgent([
        toolCallJson('queryMetricSummary', { metric: 'hrv' }),
        toolCallJson('queryVisibleChartFacts', { metric: 'sleep' }),
      ]);

      const result = await runConstrainedReAct(
        createDeps(agent, tools),
        createInput([createNeed('hrv'), createNeed('sleep')]),
      );

      expect(result.stillUnresolved).toBe(false);
      expect(result.collectedEvidence).toHaveLength(2);
      expect(result.steps).toHaveLength(2);

      // 验证步骤记录
      expect(result.steps[0].toolName).toBe('queryMetricSummary');
      expect(result.steps[0].output.success).toBe(true);
      expect(result.steps[1].toolName).toBe('queryVisibleChartFacts');
    });
  });

  describe('部分满足', () => {
    it('第一次成功，第二次失败 → stillUnresolved: true', async () => {
      const toolA = createMockTool('queryMetricSummary', async () => ({
        success: true,
        data: { metric: 'hrv', latest: 48 },
        evidenceIds: ['ev-hrv-1'],
      }));
      const toolB = createMockTool('queryVisibleChartFacts', async () => ({
        success: false,
        error: { code: 'no_data', message: '无数据' },
      }));

      const tools = new Map([
        ['queryMetricSummary', toolA],
        ['queryVisibleChartFacts', toolB],
      ]);

      const agent = createMockAgent([
        toolCallJson('queryMetricSummary', { metric: 'hrv' }),
        toolCallJson('queryVisibleChartFacts', { metric: 'sleep' }),
      ]);

      const result = await runConstrainedReAct(
        createDeps(agent, tools),
        createInput([createNeed('hrv'), createNeed('sleep')], 3),
      );

      // 第一次成功收集证据并移除一个 need，第二次失败不移除
      expect(result.collectedEvidence).toHaveLength(1);
      expect(result.stillUnresolved).toBe(true);
      expect(result.steps).toHaveLength(2);
    });
  });

  describe('全部失败', () => {
    it('planner 无法选择 tool → stillUnresolved: true, steps 为空', async () => {
      // planner 返回非法 JSON
      const agent = createMockAgent(['这不是 JSON']);
      const tools = new Map([
        ['queryMetricSummary', createMockTool('queryMetricSummary', async () => ({
          success: true, data: {}, evidenceIds: [],
        }))],
      ]);

      const result = await runConstrainedReAct(
        createDeps(agent, tools),
        createInput([createNeed('hrv')]),
      );

      expect(result.stillUnresolved).toBe(true);
      expect(result.steps).toHaveLength(0);
      expect(result.collectedEvidence).toHaveLength(0);
    });

    it('planner 返回不在白名单中的 tool → 终止循环', async () => {
      const agent = createMockAgent([
        toolCallJson('unknownTool', {}),
      ]);
      const tools = new Map([
        ['queryMetricSummary', createMockTool('queryMetricSummary', async () => ({
          success: true, data: {}, evidenceIds: [],
        }))],
      ]);

      const result = await runConstrainedReAct(
        createDeps(agent, tools),
        createInput([createNeed('hrv')]),
      );

      // selectTool 内部验证白名单，不在白名单返回 success: false → 终止循环
      expect(result.stillUnresolved).toBe(true);
      expect(result.steps).toHaveLength(0);
    });
  });

  describe('工具错误', () => {
    it('tool execute 抛异常 → 步骤记录中 success: false', async () => {
      const failingTool = createMockTool('queryMetricSummary', async () => {
        throw new Error('数据库连接失败');
      });

      const tools = new Map([
        ['queryMetricSummary', failingTool],
      ]);

      const agent = createMockAgent([
        toolCallJson('queryMetricSummary', { metric: 'hrv' }),
      ]);

      const result = await runConstrainedReAct(
        createDeps(agent, tools),
        createInput([createNeed('hrv')]),
      );

      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].output.success).toBe(false);
      if (!result.steps[0].output.success) {
        expect(result.steps[0].output.error.message).toContain('数据库连接失败');
      }
      expect(result.collectedEvidence).toHaveLength(0);
      expect(result.stillUnresolved).toBe(true);
    });
  });

  describe('达到最大步数', () => {
    it('maxSteps: 2 但有 3 个 needs → 最多执行 2 步', async () => {
      const tool = createMockTool('queryMetricSummary', async () => ({
        success: true,
        data: { metric: 'hrv' },
        evidenceIds: ['ev-1'],
      }));

      const tools = new Map([
        ['queryMetricSummary', tool],
      ]);

      const agent = createMockAgent([
        toolCallJson('queryMetricSummary', { metric: 'hrv' }),
        toolCallJson('queryMetricSummary', { metric: 'sleep' }),
      ]);

      const result = await runConstrainedReAct(
        createDeps(agent, tools),
        createInput(
          [createNeed('hrv'), createNeed('sleep'), createNeed('spo2')],
          2, // maxSteps = 2
        ),
      );

      expect(result.steps).toHaveLength(2);
      expect(result.collectedEvidence).toHaveLength(2);
      // 还有 1 个 need 未满足
      expect(result.stillUnresolved).toBe(true);
    });
  });

  describe('步骤编号和时间戳', () => {
    it('步骤编号从 1 开始递增', async () => {
      const tool = createMockTool('queryMetricSummary', async () => ({
        success: true,
        data: {},
        evidenceIds: ['ev-1'],
      }));

      const tools = new Map([
        ['queryMetricSummary', tool],
      ]);

      const agent = createMockAgent([
        toolCallJson('queryMetricSummary', { metric: 'hrv' }),
        toolCallJson('queryMetricSummary', { metric: 'sleep' }),
      ]);

      const result = await runConstrainedReAct(
        createDeps(agent, tools),
        createInput([createNeed('hrv'), createNeed('sleep')]),
      );

      expect(result.steps[0].stepNumber).toBe(1);
      expect(result.steps[1].stepNumber).toBe(2);
      // 时间戳应为合法 ISO 字符串
      expect(new Date(result.steps[0].timestamp).toISOString()).toBe(result.steps[0].timestamp);
    });
  });
});
