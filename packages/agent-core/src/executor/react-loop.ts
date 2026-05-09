import { z } from 'zod';
import type { HealthAgent } from './create-agent';
import type { ToolDefinition, ToolExecutionContext, ToolResult, ReActStep } from '../tools/tool-types';
import type { AnalysisPlan } from '../planner/analysis-plan';

/** ReAct 循环依赖 */
export interface ReActLoopDeps {
  /** 复用 planner agent 做工具选择 */
  plannerAgent: HealthAgent;
  /** 可用工具映射（白名单） */
  tools: Map<string, ToolDefinition<unknown, unknown>>;
  /** ReAct 系统 prompt（直接注入，与 planBuilder 一致） */
  reactPrompt: string;
}

/** ReAct 循环输入 */
export interface ReActLoopInput {
  /** 未满足的 evidence needs */
  unresolvedNeeds: AnalysisPlan['evidenceNeeds'];
  /** 工具执行上下文 */
  context: ToolExecutionContext;
  /** 最大步骤数 */
  maxSteps: number;
}

/** ReAct 循环结果 */
export interface ReActLoopResult {
  /** 收集到的证据 */
  collectedEvidence: Array<{ data: unknown; evidenceIds: string[] }>;
  /** 执行步骤记录 */
  steps: ReActStep[];
  /** 是否仍有未满足的 required evidence */
  stillUnresolved: boolean;
}

/** 工具调用选择的结构化输出 schema */
const ToolCallSchema = z.object({
  toolName: z.string(),
  input: z.record(z.unknown()),
});

/**
 * 受限 ReAct 循环
 *
 * 流程：
 * 1. 将未满足的 needs 发给 planner
 * 2. Planner 返回结构化 tool call
 * 3. 执行 tool，收集 observation
 * 4. 检查是否满足 needs
 * 5. 重复直到所有 needs 满足或达到 maxSteps
 *
 * 约束：
 * - 最大 maxSteps 步
 * - action 必须是白名单 tool call
 * - observation 必须是 schema 化结果
 */
export async function runConstrainedReAct(
  deps: ReActLoopDeps,
  input: ReActLoopInput,
): Promise<ReActLoopResult> {
  const steps: ReActStep[] = [];
  const collectedEvidence: Array<{ data: unknown; evidenceIds: string[] }> = [];
  const remainingNeeds = [...input.unresolvedNeeds];

  for (let step = 0; step < input.maxSteps && remainingNeeds.length > 0; step++) {
    // 1. 让 planner 选择下一步 tool
    const toolCallResult = await selectTool(deps, remainingNeeds, steps);

    if (!toolCallResult.success) {
      // planner 无法选择 tool → 终止循环
      break;
    }

    const { toolName, toolInput } = toolCallResult;

    // 2. 查找 tool
    const tool = deps.tools.get(toolName);
    if (!tool) {
      // 非白名单 tool → 记录并跳过
      steps.push({
        stepNumber: step + 1,
        toolName,
        input: toolInput,
        output: { success: false, error: { code: 'unknown_tool', message: `工具 "${toolName}" 不在白名单中` } },
        timestamp: new Date().toISOString(),
      });
      continue;
    }

    // 3. 执行 tool
    let toolOutput: ToolResult<unknown>;
    try {
      toolOutput = await tool.execute(toolInput, input.context);
    } catch (error) {
      toolOutput = {
        success: false,
        error: {
          code: 'tool_execution_error',
          message: error instanceof Error ? error.message : '工具执行失败',
        },
      };
    }

    // 4. 记录步骤
    const reactStep: ReActStep = {
      stepNumber: step + 1,
      toolName,
      input: toolInput,
      output: toolOutput,
      timestamp: new Date().toISOString(),
    };
    steps.push(reactStep);

    // 5. 收集证据
    if (toolOutput.success) {
      collectedEvidence.push({
        data: toolOutput.data,
        evidenceIds: toolOutput.evidenceIds,
      });
      // 从 remaining needs 中移除第一个（简单策略：每步尝试满足一个 need）
      remainingNeeds.shift();
    }
  }

  return {
    collectedEvidence,
    steps,
    stillUnresolved: remainingNeeds.length > 0,
  };
}

/** 让 planner 选择下一步 tool */
async function selectTool(
  deps: ReActLoopDeps,
  remainingNeeds: AnalysisPlan['evidenceNeeds'],
  previousSteps: ReActStep[],
): Promise<{ success: true; toolName: string; toolInput: Record<string, unknown> } | { success: false }> {
  try {
    const userPrompt = buildToolSelectionPrompt(remainingNeeds, previousSteps, deps.tools);

    const response = await deps.plannerAgent.invoke({
      systemPrompt: deps.reactPrompt,
      userPrompt,
    });

    // 解析 JSON
    const jsonStr = extractJson(response.content);
    const parsed = JSON.parse(jsonStr);
    const result = ToolCallSchema.safeParse(parsed);

    if (!result.success) {
      return { success: false };
    }

    // 验证 tool 在白名单中
    if (!deps.tools.has(result.data.toolName)) {
      return { success: false };
    }

    return {
      success: true,
      toolName: result.data.toolName,
      toolInput: result.data.input,
    };
  } catch {
    return { success: false };
  }
}

/** 构建 tool 选择 prompt */
function buildToolSelectionPrompt(
  needs: AnalysisPlan['evidenceNeeds'],
  previousSteps: ReActStep[],
  tools: Map<string, ToolDefinition<unknown, unknown>>,
): string {
  const sections: string[] = [];

  sections.push('## 未满足的证据需求');
  for (const need of needs) {
    sections.push(`- ${need.metric} (${need.timeScope}): ${need.reason} [${need.required ? '必需' : '可选'}]`);
  }

  if (previousSteps.length > 0) {
    sections.push('');
    sections.push('## 已执行的步骤');
    for (const step of previousSteps) {
      sections.push(`- 步骤${step.stepNumber}: ${step.toolName} → ${step.output.success ? '成功' : '失败'}`);
    }
  }

  sections.push('');
  sections.push('## 可用工具');
  for (const [name, tool] of tools) {
    sections.push(`- ${name}: ${tool.description}`);
  }

  sections.push('');
  sections.push('请选择一个工具来满足第一个未满足的证据需求。输出 JSON 格式：');
  sections.push('```json');
  sections.push('{ "toolName": "工具名", "input": { ... } }');
  sections.push('```');

  return sections.join('\n');
}

/** 从文本中提取 JSON */
function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch?.[1]) return codeBlockMatch[1].trim();

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}
