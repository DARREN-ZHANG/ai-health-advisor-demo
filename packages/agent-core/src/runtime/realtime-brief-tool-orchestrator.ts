import type { TaskContextPacket } from '../context/context-packet';
import type { AgentContext } from '../types/agent-context';
import type { ToolDefinition, ToolResult } from '../tools/tool-types';
import {
  estimateCaffeineSleepImpactTool,
  type CaffeineSleepImpactOutput,
} from '../tools/estimate-caffeine-sleep-impact';

// ────────────────────────────────────────────
// 内部：触发策略与执行 artifact（保留完整信息，供可观测性使用）
// ────────────────────────────────────────────

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

/**
 * 内部观测 artifact：保留工具执行的全部信息（含 toolName、policyId、status、error）。
 *
 * 仅用于日志/调试/可观测性，禁止渲染到 solver prompt。
 * 公开侧请使用 `buildPublicToolClaimsFromEvidence` 投影出的 `PublicToolClaim`。
 */
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

/**
 * 内部执行函数：按 plan 调用工具，产出完整 artifact。
 *
 * 此函数保留 success/error 的全部内部信息（包括 toolName、policyId、error message），
 * 供可观测性与调试使用。任何对 solver prompt 的渲染必须经由 `buildPublicToolClaimsFromEvidence`
 * 投影后再使用 `projectRealtimeBriefToolEvidenceForPrompt`。
 */
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

// ────────────────────────────────────────────
// 公开：PublicToolClaim 投影（客户可见的工具结论）
// ────────────────────────────────────────────

/**
 * 公开工具结论：客户可见的工具产出的最小投影。
 *
 * 设计意图：
 * 1. 只包含成功工具产出的"客户可用结论"。
 * 2. 不携带 toolName、policyId、priority、reason、status、error 等内部执行元数据。
 * 3. 不携带 halfLifeHours、eliminationRateK、measuredChemically 等算法常量。
 * 4. 当工具失败、未调用或成功但无可用数据时，不产出任何 claim。
 *
 * `summary` 是 LLM 唯一可见的字段，文案使用"估算"等概率性措辞，
 * 不追加"戒指无法测量/没有专业算法"等元说明。
 */
export interface PublicToolClaim {
  claimId: string;
  kind: 'estimated_caffeine_sleep_impact';
  summary: string;
  evidenceIds: string[];
}

/**
 * 从内部 evidence packet 投影出公开 claim 列表。
 *
 * 规则：
 * - status !== 'success' 的 item 完全静默
 * - success 但无可用数据（如 hasCaffeineEvent=false）也完全静默
 * - 仅 success with data 产出 claim
 *
 * 纯函数：不修改输入。
 */
export function buildPublicToolClaimsFromEvidence(
  evidence: RealtimeBriefToolEvidencePacket,
): PublicToolClaim[] {
  const claims: PublicToolClaim[] = [];

  for (const item of evidence.items) {
    if (item.status !== 'success') continue;
    const claim = projectItemToClaim(item);
    if (claim) claims.push(claim);
  }

  return claims;
}

function projectItemToClaim(item: RealtimeBriefToolEvidenceItem): PublicToolClaim | undefined {
  if (item.toolName === estimateCaffeineSleepImpactTool.name && isCaffeineSleepImpactOutput(item.data)) {
    return projectCaffeineSleepImpactClaim(item);
  }
  return undefined;
}

function projectCaffeineSleepImpactClaim(
  item: RealtimeBriefToolEvidenceItem,
): PublicToolClaim | undefined {
  const data = item.data as CaffeineSleepImpactOutput;
  // 成功但无可用数据：完全静默
  if (!data.hasCaffeineEvent || !data.event || !data.estimatedCaffeineLoad || !data.sleepImpact || !data.advice) {
    return undefined;
  }

  const percent = Math.round(data.estimatedCaffeineLoad.remainingRatioAtSleep * 100);
  const impactByLevel: Record<typeof data.sleepImpact.riskLevel, string> = {
    low: '对今晚睡眠的影响预计较低',
    moderate: '可能轻度影响入睡与深睡比例',
    high: '对入睡和深睡的影响可能偏高',
  };
  const impact = impactByLevel[data.sleepImpact.riskLevel];

  // 客户可用结论：只保留"估算"语义，不暴露算法常量、toolName 或任何执行元数据
  const summary = `估算约 ${percent}% 的咖啡因负荷可能持续到今晚入睡时间，${impact}。${data.advice.message}`;

  return {
    claimId: `claim-${item.policyId}`,
    kind: 'estimated_caffeine_sleep_impact',
    summary,
    evidenceIds: [...item.evidenceIds],
  };
}

function isCaffeineSleepImpactOutput(value: unknown): value is CaffeineSleepImpactOutput {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as { hasCaffeineEvent?: unknown }).hasCaffeineEvent === 'boolean';
}

// ────────────────────────────────────────────
// 公开 projection 渲染到 solver prompt
// ────────────────────────────────────────────

/**
 * 将公开 claim 列表渲染到 solver prompt。
 *
 * 不变性：
 * 1. claims 为空时返回原始 taskPrompt（完全静默）
 * 2. 仅渲染 claim.summary，不渲染任何内部字段
 * 3. 章节标题使用客户语言（"## 工具结论"），不出现 toolName
 */
export function projectRealtimeBriefToolEvidenceForPrompt(
  taskPrompt: string,
  claims: PublicToolClaim[],
): string {
  if (claims.length === 0) return taskPrompt;

  const lines = [taskPrompt, '', '## 工具结论'];
  lines.push('以下是当前可用的工具结论，可直接转写到 summary。');

  for (const claim of claims) {
    lines.push('');
    lines.push(`- ${claim.summary}`);
  }

  return lines.join('\n');
}

// ────────────────────────────────────────────
// 向后兼容入口：直接从 evidence 投影并渲染
// ────────────────────────────────────────────

/**
 * 从内部 evidence 投影公开 claim 并渲染到 prompt。
 *
 * 等价于 `projectRealtimeBriefToolEvidenceForPrompt(taskPrompt, buildPublicToolClaimsFromEvidence(evidence))`。
 * 保留此入口以便 agent-runtime 单点调用，且无需感知 projection 内部细节。
 */
export function appendRealtimeBriefToolEvidenceToPrompt(
  taskPrompt: string,
  evidence: RealtimeBriefToolEvidencePacket,
): string {
  const claims = buildPublicToolClaimsFromEvidence(evidence);
  return projectRealtimeBriefToolEvidenceForPrompt(taskPrompt, claims);
}
