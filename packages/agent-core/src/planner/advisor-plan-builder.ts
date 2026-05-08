import { z } from 'zod';
import type { HealthAgent } from '../executor/create-agent';
import type { TaskContextPacket } from '../context/context-packet';
import { AnalysisPlanSchema } from './analysis-plan';
import type { AnalysisPlan, PlanVerificationResult } from './analysis-plan';
import { verifyAnalysisPlan } from './analysis-plan-verifier';

/** Plan Builder 依赖注入 */
export interface PlanBuilderDeps {
  plannerAgent: HealthAgent;
  /** 直接注入 planner prompt 文本（不使用 PromptLoader，与 T3 ReflectionObserver 一致） */
  plannerPrompt: string;
}

/** Plan Builder 输入 */
export interface PlanBuilderInput {
  userMessage: string;
  pageContext: {
    profileId: string;
    page: string;
    dataTab?: string;
    timeframe: string;
    customDateRange?: { start: string; end: string };
  };
  basePacket: TaskContextPacket;
  supportedMetrics: string[];
  availableDateRange: { start: string; end: string };
  /** 重试时传入上一轮的 violations */
  previousViolations?: PlanVerificationResult['violations'];
}

/** Plan Builder 输出 */
export interface PlanBuilderResult {
  success: boolean;
  plan?: AnalysisPlan;
  parseError?: string;
  verificationResult?: PlanVerificationResult;
}

/**
 * 调用 planner LLM 生成 AnalysisPlan
 */
export async function buildAnalysisPlan(
  deps: PlanBuilderDeps,
  input: PlanBuilderInput,
): Promise<PlanBuilderResult> {
  try {
    // 1. 构建 planner user prompt
    const userPrompt = buildPlannerUserPrompt(input);

    // 2. 调用 planner LLM
    const response = await deps.plannerAgent.invoke({
      systemPrompt: deps.plannerPrompt,
      userPrompt,
    });

    // 3. 解析 JSON
    const parseResult = parsePlanJson(response.content);
    if (!parseResult.success) {
      return { success: false, parseError: parseResult.error };
    }

    // 4. Schema 校验
    const schemaResult = AnalysisPlanSchema.safeParse(parseResult.data);
    if (!schemaResult.success) {
      return { success: false, parseError: formatZodError(schemaResult.error) };
    }

    // 5. 业务规则校验
    const verificationResult = verifyAnalysisPlan(schemaResult.data, {
      supportedMetrics: input.supportedMetrics,
      maxSummaryLength: 800,
      availableDateRange: input.availableDateRange,
    });

    if (!verificationResult.valid) {
      return { success: false, verificationResult };
    }

    return { success: true, plan: schemaResult.data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, parseError: `Planner 调用失败: ${message}` };
  }
}

/**
 * 带重试的 plan 生成（最多调用 planner 2 次）
 * 第一次验证失败时，将 violations 反馈给 planner 再试一次
 */
export async function buildAnalysisPlanWithRetry(
  deps: PlanBuilderDeps,
  input: PlanBuilderInput,
): Promise<PlanBuilderResult> {
  const firstAttempt = await buildAnalysisPlan(deps, input);

  if (firstAttempt.success) return firstAttempt;
  if (!firstAttempt.verificationResult) return firstAttempt; // 解析错误不重试

  // 重试一次：将 violations 反馈给 planner
  const retryInput: PlanBuilderInput = {
    ...input,
    previousViolations: firstAttempt.verificationResult.violations,
  };
  const retryResult = await buildAnalysisPlan(deps, retryInput);

  return retryResult.success ? retryResult : firstAttempt;
}

/**
 * 构建 planner user prompt
 * 包含用户消息、页面上下文、可用指标、可用时间范围
 * 如有 previousViolations，附加修正指引
 */
function buildPlannerUserPrompt(input: PlanBuilderInput): string {
  const sections: string[] = [];

  // 用户消息
  sections.push(`## 用户消息\n${input.userMessage}`);

  // 页面上下文
  const ctx = input.pageContext;
  const pageContextLines = [
    `profileId: ${ctx.profileId}`,
    `page: ${ctx.page}`,
    `timeframe: ${ctx.timeframe}`,
  ];
  if (ctx.dataTab) {
    pageContextLines.push(`dataTab: ${ctx.dataTab}`);
  }
  if (ctx.customDateRange) {
    pageContextLines.push(`customDateRange: ${ctx.customDateRange.start} ~ ${ctx.customDateRange.end}`);
  }
  sections.push(`## 页面上下文\n${pageContextLines.join('\n')}`);

  // 可用指标
  sections.push(`## 可用指标列表\n${input.supportedMetrics.join(', ')}`);

  // 可用数据时间范围
  sections.push(`## 可用数据时间范围\n${input.availableDateRange.start} ~ ${input.availableDateRange.end}`);

  // 重试时的 violations 修正指引
  if (input.previousViolations && input.previousViolations.length > 0) {
    const violationLines = input.previousViolations.map(
      (v) => `- [${v.rule}] ${v.message} (路径: ${v.path})`,
    );
    sections.push(`## 上次校验失败，请修正以下问题\n${violationLines.join('\n')}`);
  }

  return sections.join('\n\n');
}

/**
 * 从 LLM 返回文本中提取 JSON
 * 支持 markdown code block 包裹和原始 JSON
 */
function parsePlanJson(
  raw: string,
): { success: true; data: unknown } | { success: false; error: string } {
  const trimmed = raw.trim();

  // 尝试提取 markdown code block 中的 JSON
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  const jsonCandidate = codeBlockMatch?.[1]?.trim() ?? trimmed;

  try {
    const parsed = JSON.parse(jsonCandidate);
    return { success: true, data: parsed };
  } catch {
    // 尝试宽松匹配：查找第一个 { 到最后一个 }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        const extracted = trimmed.slice(firstBrace, lastBrace + 1);
        const parsed = JSON.parse(extracted);
        return { success: true, data: parsed };
      } catch {
        return { success: false, error: `JSON 解析失败: 原始内容 "${trimmed.slice(0, 100)}..."` };
      }
    }
    return { success: false, error: `JSON 解析失败: 原始内容 "${trimmed.slice(0, 100)}..."` };
  }
}

/**
 * 格式化 Zod 错误为可读字符串
 */
function formatZodError(error: z.ZodError): string {
  return error.errors
    .map((e) => `${e.path.join('.')}: ${e.message}`)
    .join('; ');
}
