import type { TaskContextPacket } from '../context/context-packet';
import type { AgentContext } from '../types/agent-context';
import type { ToolDefinition, ToolResult } from '../tools/tool-types';
import {
  estimateCaffeineSleepImpactTool,
  type CaffeineSleepImpactOutput,
} from '../tools/estimate-caffeine-sleep-impact';

export interface RealtimeBriefToolTriggerPolicy {
  id: string;
  toolName: string;
  priority: number;
  reason: string;
  when(packet: TaskContextPacket, context: AgentContext): boolean;
  buildInput(packet: TaskContextPacket, context: AgentContext): unknown;
}

export interface RealtimeBriefToolInvocation {
  policyId: string;
  toolName: string;
  priority: number;
  reason: string;
  input: unknown;
}

export interface RealtimeBriefToolInvocationPlan {
  invocations: RealtimeBriefToolInvocation[];
}

export interface RealtimeBriefToolEvidenceItem {
  policyId: string;
  toolName: string;
  priority: number;
  reason: string;
  input: unknown;
  status: 'success' | 'error';
  data?: unknown;
  evidenceIds: string[];
  error?: string;
}

export interface RealtimeBriefToolEvidencePacket {
  items: RealtimeBriefToolEvidenceItem[];
}

export function createDefaultRealtimeBriefToolPolicies(): RealtimeBriefToolTriggerPolicy[] {
  return [
    {
      id: 'caffeine-sleep-impact-on-possible-caffeine',
      toolName: estimateCaffeineSleepImpactTool.name,
      priority: 80,
      reason: 'possible_caffeine_intake event should enrich realtime brief with estimated caffeine load at sleep time',
      when(packet) {
        if (packet.task.type !== 'homepage_summary') return false;
        return (packet.homepage?.recentEvents ?? []).some((event) => event.type === 'possible_caffeine_intake');
      },
      buildInput() {
        return {};
      },
    },
  ];
}

export function createDefaultRealtimeBriefTools(): Map<string, ToolDefinition<unknown, unknown>> {
  return new Map<string, ToolDefinition<unknown, unknown>>([
    [estimateCaffeineSleepImpactTool.name, estimateCaffeineSleepImpactTool as ToolDefinition<unknown, unknown>],
  ]);
}

export function buildRealtimeBriefToolInvocationPlan(
  packet: TaskContextPacket,
  context: AgentContext,
  policies: RealtimeBriefToolTriggerPolicy[] = createDefaultRealtimeBriefToolPolicies(),
): RealtimeBriefToolInvocationPlan {
  if (packet.task.type !== 'homepage_summary') {
    return { invocations: [] };
  }

  const invocations = policies
    .filter((policy) => policy.when(packet, context))
    .map((policy) => ({
      policyId: policy.id,
      toolName: policy.toolName,
      priority: policy.priority,
      reason: policy.reason,
      input: policy.buildInput(packet, context),
    }))
    .sort((a, b) => b.priority - a.priority);

  return { invocations };
}

export async function executeRealtimeBriefToolPlan(
  plan: RealtimeBriefToolInvocationPlan,
  packet: TaskContextPacket,
  context: AgentContext,
  tools: Map<string, ToolDefinition<unknown, unknown>> = createDefaultRealtimeBriefTools(),
  maxTools = 3,
): Promise<RealtimeBriefToolEvidencePacket> {
  const items: RealtimeBriefToolEvidenceItem[] = [];

  for (const invocation of plan.invocations.slice(0, maxTools)) {
    const tool = tools.get(invocation.toolName);
    if (!tool) {
      items.push({
        ...invocation,
        status: 'error',
        evidenceIds: [],
        error: `Tool not registered: ${invocation.toolName}`,
      });
      continue;
    }

    const parsedInput = tool.inputSchema.safeParse(invocation.input);
    if (!parsedInput.success) {
      items.push({
        ...invocation,
        status: 'error',
        evidenceIds: [],
        error: `Invalid input: ${parsedInput.error.errors.map((error) => `${error.path.join('.')}: ${error.message}`).join('; ')}`,
      });
      continue;
    }

    let result: ToolResult<unknown>;
    try {
      result = await tool.execute(parsedInput.data, { packet, context });
    } catch (error) {
      result = {
        success: false,
        error: {
          code: 'realtime_brief_tool_execution_error',
          message: error instanceof Error ? error.message : '实时简报工具执行失败',
        },
      };
    }

    if (result.success) {
      items.push({
        ...invocation,
        status: 'success',
        data: result.data,
        evidenceIds: result.evidenceIds,
      });
    } else {
      items.push({
        ...invocation,
        status: 'error',
        evidenceIds: [],
        error: result.error.message,
      });
    }
  }

  return { items };
}

export function appendRealtimeBriefToolEvidenceToPrompt(
  taskPrompt: string,
  evidencePacket: RealtimeBriefToolEvidencePacket,
): string {
  if (evidencePacket.items.length === 0) return taskPrompt;

  const lines = [taskPrompt, '', '## 工具证据包'];
  lines.push('以下结果来自实时简报 Tool Orchestrator。只能引用 status=success 的工具结果；不得编造未出现的工具结果。');

  for (const item of evidencePacket.items) {
    lines.push('');
    lines.push(`### ${item.toolName}`);
    lines.push(`- policyId: ${item.policyId}`);
    lines.push(`- status: ${item.status}`);
    lines.push(`- priority: ${item.priority}`);
    lines.push(`- reason: ${item.reason}`);
    if (item.evidenceIds.length > 0) {
      lines.push(`- evidenceIds: ${item.evidenceIds.join(', ')}`);
    }

    if (item.status === 'success') {
      lines.push(...renderSuccessfulToolEvidence(item.toolName, item.data));
    } else {
      lines.push(`- error: ${item.error ?? 'unknown tool error'}`);
      lines.push('- 写作要求: 不要引用失败工具的结果。');
    }
  }

  return lines.join('\n');
}

function renderSuccessfulToolEvidence(toolName: string, data: unknown): string[] {
  if (toolName === estimateCaffeineSleepImpactTool.name && isCaffeineSleepImpactOutput(data)) {
    return renderCaffeineSleepImpact(data);
  }

  return [
    `- data: ${JSON.stringify(data)}`,
    '- 写作要求: 只引用 data 中明确存在的字段，不得补充工具未返回的数字。',
  ];
}

function renderCaffeineSleepImpact(data: CaffeineSleepImpactOutput): string[] {
  if (!data.hasCaffeineEvent || !data.event || !data.estimatedCaffeineLoad || !data.sleepImpact || !data.advice) {
    return ['- 工具结果: 没有足够证据估算咖啡因对今晚睡眠的影响。'];
  }

  const load = data.estimatedCaffeineLoad;
  const percent = Math.round(load.remainingRatioAtSleep * 100);
  return [
    `- 事件: possible_caffeine_intake, start=${data.event.start}, confidence=${Math.round(data.event.confidence * 100)}%`,
    `- 估算咖啡因剩余比例: ${percent}%`,
    `- 估算依据: ${load.basis}, measuredChemically=${load.measuredChemically}`,
    `- 半衰期模型: halfLifeHours=${load.halfLifeHours}, hoursUntilSleep=${load.hoursUntilSleep}, eliminationRateK=${load.eliminationRateK}`,
    `- 睡眠影响等级: ${data.sleepImpact.riskLevel}`,
    `- 睡眠影响解释: ${data.sleepImpact.rationale}`,
    `- 支持型建议: ${data.advice.message}`,
    '- 写作要求: 如果 summary 提到该结果，必须说"估算咖啡因剩余比例"或"估算体内咖啡因负荷"，并说明这不是血液化学实测。不得说确认摄入咖啡因、血液咖啡因浓度、一定失眠。',
  ];
}

function isCaffeineSleepImpactOutput(value: unknown): value is CaffeineSleepImpactOutput {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as { hasCaffeineEvent?: unknown }).hasCaffeineEvent === 'boolean';
}
