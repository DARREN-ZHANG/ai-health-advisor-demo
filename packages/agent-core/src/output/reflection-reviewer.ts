import type { HealthAgent } from '../executor/create-agent';
import type { ReflectionReviewInput, ReflectionReviewResult } from './reflection-schema';
import { ReflectionReviewResultSchema } from './reflection-schema';

/** Sync reflection reviewer 依赖 */
export interface SyncReflectionReviewerDeps {
  reviewerAgent: HealthAgent;
  /** 直接注入 gate prompt 文本（与 T3/T6 一致，不使用 PromptLoader） */
  gatePrompt: string;
}

/**
 * Sync Reflection Reviewer
 * 使用 reviewer agent 进行同步（阻断式）审核。
 */
export class SyncReflectionReviewer {
  constructor(private deps: SyncReflectionReviewerDeps) {}

  /**
   * 同步审核回复质量。
   * 返回 ReflectionReviewResult，不抛异常（异常时返回 rejected 状态）。
   */
  async review(input: ReflectionReviewInput): Promise<ReflectionReviewResult> {
    try {
      const userPrompt = buildGateUserPrompt(input);
      const response = await this.deps.reviewerAgent.invoke({
        systemPrompt: this.deps.gatePrompt,
        userPrompt,
      });
      return parseReviewResponse(response.content);
    } catch (error) {
      // 审核失败时返回 rejected 状态，附带系统错误 violation
      const message = error instanceof Error ? error.message : String(error);
      return {
        approved: false,
        violations: [{
          category: 'accuracy',
          severity: 'high',
          description: `同步审核失败: ${message}`,
          requiredChanges: '系统错误，建议返回安全响应',
        }],
      };
    }
  }
}

// ── 内部工具函数 ──────────────────────────────────────

/**
 * 构建 gate 用户 prompt。
 * 包含 envelope 内容、verificationReport violations、plan riskLevel、collectedEvidence 数量。
 */
function buildGateUserPrompt(input: ReflectionReviewInput): string {
  const { envelope, verificationReport, plan, collectedEvidence } = input;
  const sections: string[] = [];

  // AI 回复内容
  sections.push('## AI 回复内容');
  sections.push(`- 摘要: ${envelope.summary}`);
  sections.push(`- 状态颜色: ${envelope.statusColor}`);
  if (envelope.microTips.length > 0) {
    sections.push(`- 微建议: ${envelope.microTips.join('; ')}`);
  }

  // 确定性验证结果
  sections.push('');
  sections.push('## 确定性验证结果');
  const failedViolations = verificationReport.violations.filter((v) => !v.passed);
  if (failedViolations.length === 0) {
    sections.push('- 所有确定性检查均通过');
  } else {
    for (const v of failedViolations) {
      sections.push(`- [${v.severity}] ${v.ruleId}: ${v.message}`);
    }
  }

  // 分析计划信息
  if (plan) {
    sections.push('');
    sections.push('## 分析计划');
    sections.push(`- 风险等级: ${plan.userIntent.riskLevel}`);
    if (plan.safetyConstraints.length > 0) {
      sections.push(`- 安全约束: ${plan.safetyConstraints.join(', ')}`);
    }
  }

  // 可用证据数量
  if (collectedEvidence !== undefined) {
    sections.push('');
    sections.push(`## 可用证据数量: ${collectedEvidence.length} 条`);
  }

  sections.push('');
  sections.push('请根据以上信息，严格按照输出格式返回 JSON 审核结果。');

  return sections.join('\n');
}

/**
 * 解析 reviewer LLM 返回的 JSON。
 * 使用 Zod schema 校验，解析失败返回安全的默认值。
 */
function parseReviewResponse(raw: string): ReflectionReviewResult {
  try {
    const jsonStr = extractJsonBlock(raw);
    const parsed = JSON.parse(jsonStr);
    const result = ReflectionReviewResultSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    // Zod 校验失败，返回安全默认值
    return { approved: false, violations: [] };
  } catch {
    // JSON 解析失败，返回安全默认值
    return { approved: false, violations: [] };
  }
}

/** 从文本中提取 JSON 块（支持 markdown code block 包裹和纯 JSON） */
function extractJsonBlock(raw: string): string {
  const trimmed = raw.trim();

  // 尝试匹配 ```json ... ``` 格式
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch?.[1]) {
    return codeBlockMatch[1].trim();
  }

  // 尝试匹配 { ... } 格式
  const braceStart = trimmed.indexOf('{');
  const braceEnd = trimmed.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    return trimmed.slice(braceStart, braceEnd + 1);
  }

  return trimmed;
}
