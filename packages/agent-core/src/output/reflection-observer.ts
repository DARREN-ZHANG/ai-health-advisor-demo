import type { HealthAgent } from '../executor/create-agent';
import type { ReflectionArtifact, ReviewResult } from './reflection-types';

// ── 依赖注入接口 ──────────────────────────────────────

export interface ReflectionObserverDeps {
  /** T1 配置的独立 reviewer agent */
  reviewerAgent: HealthAgent;
  /** reviewer prompt 文本（不使用 PromptLoader 接口，直接注入） */
  reviewerPrompt: string;
}

// ── 输入接口 ──────────────────────────────────────────

export interface ReflectionObserverInput {
  /** 被审核的原始输出 */
  envelope: AgentResponseEnvelope;
  /** verifier 产生的报告 */
  report: VerificationReport;
  /** agent 上下文（用于构建 prompt） */
  context: {
    task: {
      type: string;
      userMessage?: string;
    };
    dataWindow: {
      missingFields: string[];
    };
    signals: {
      overallStatus: string;
      anomalies: string[];
    };
  };
  /** 上下文数据包 */
  packet: {
    evidence: Array<{ id: string; derivation: string }>;
    missingData: Array<{ metric: string; impact: string }>;
    visibleCharts: Array<{ chartToken: string }>;
  };
  /** 原始 system prompt（预留：reviewer 可据此评估 prompt 质量） */
  systemPrompt: string;
  /** 原始 task prompt（预留：reviewer 可据此评估 prompt 质量） */
  taskPrompt: string;
}

// ── Observer 实现 ──────────────────────────────────────

export class ReflectionObserver {
  constructor(private deps: ReflectionObserverDeps) {}

  /**
   * 异步执行 reflection 审核。
   * 不阻断主链路——内部 catch 所有异常，返回安全的错误态 ReflectionArtifact。
   */
  async observeAsync(input: ReflectionObserverInput): Promise<ReflectionArtifact> {
    try {
      // 1. 构建 reviewer 输入
      const userPrompt = buildReviewerUserPrompt(input);

      // 2. 调用 reviewer LLM
      const response = await this.deps.reviewerAgent.invoke({
        systemPrompt: this.deps.reviewerPrompt,
        userPrompt,
      });

      // 3. 解析结构化输出
      const reviewResult = parseReflectionResponse(response.content);

      return {
        envelopeSnapshot: input.envelope,
        verificationReport: input.report,
        reviewResult,
        reviewerModel: 'configured',
        reflectedAt: new Date().toISOString(),
      };
    } catch (error) {
      // 不抛错到外部，返回错误态 ReflectionArtifact
      const errorMessage = error instanceof Error ? error.message : String(error);
      return buildErrorReflection(input, errorMessage);
    }
  }
}

// ── 内部工具函数 ──────────────────────────────────────

/**
 * 构建 reviewer 用户 prompt。
 * 将 envelope、verificationReport violations、context 构建为 reviewer 可读的 prompt。
 */
function buildReviewerUserPrompt(input: ReflectionObserverInput): string {
  const { envelope, report, context, packet } = input;

  const sections: string[] = [];

  // 任务信息
  sections.push(`## 任务信息`);
  sections.push(`- 任务类型: ${context.task.type}`);
  if (context.task.userMessage) {
    sections.push(`- 用户问题: ${context.task.userMessage}`);
  }

  // AI 回复内容
  sections.push(``);
  sections.push(`## AI 回复内容`);
  sections.push(`- 摘要: ${envelope.summary}`);
  sections.push(`- 状态颜色: ${envelope.statusColor}`);
  if (envelope.microTips.length > 0) {
    sections.push(`- 微建议: ${envelope.microTips.join('; ')}`);
  }

  // 验证结果
  sections.push(``);
  sections.push(`## 验证结果`);
  sections.push(`- 总计: ${report.summary.total} 条规则`);
  sections.push(`- 通过: ${report.summary.passed} 条`);
  sections.push(`- 失败: ${report.summary.failed} 条`);
  sections.push(`- 严重失败: ${report.summary.hardFailures} 条`);

  // 失败的 violations
  const failedViolations = report.violations.filter((v) => !v.passed);
  if (failedViolations.length > 0) {
    sections.push(``);
    sections.push(`## 失败规则详情`);
    for (const v of failedViolations) {
      sections.push(`- [${v.severity}] ${v.ruleId}: ${v.message}`);
    }
  }

  // 上下文信息
  sections.push(``);
  sections.push(`## 数据上下文`);
  if (context.dataWindow.missingFields.length > 0) {
    sections.push(`- 缺失字段: ${context.dataWindow.missingFields.join(', ')}`);
  }
  if (packet.missingData.length > 0) {
    sections.push(`- 缺失数据影响: ${packet.missingData.map((m) => m.impact).join('; ')}`);
  }
  if (packet.evidence.length > 0) {
    sections.push(`- 可用证据: ${packet.evidence.length} 条`);
  }
  if (packet.visibleCharts.length > 0) {
    sections.push(`- 可见图表: ${packet.visibleCharts.map((c) => c.chartToken).join(', ')}`);
  }

  sections.push(``);
  sections.push(`请根据以上信息，以 JSON 格式输出你的审核结果。`);

  return sections.join('\n');
}

/**
 * 解析 reviewer LLM 返回的 JSON。
 * 容错处理：JSON 解析失败时返回安全的默认值。
 */
export function parseReflectionResponse(raw: string): ReviewResult {
  try {
    // 尝试从文本中提取 JSON 块
    const jsonStr = extractJsonBlock(raw);
    const parsed = JSON.parse(jsonStr);

    return {
      approved: typeof parsed.approved === 'boolean' ? parsed.approved : false,
      qualityScore: clampScore(parsed.qualityScore),
      issues: parseIssues(parsed.issues),
      suggestions: parseSuggestions(parsed.suggestions),
    };
  } catch {
    // JSON 解析失败，返回安全默认值
    return {
      approved: false,
      qualityScore: 0,
      issues: [],
      suggestions: [],
    };
  }
}

/** 从文本中提取 JSON 块（支持 markdown code block 包裹） */
function extractJsonBlock(raw: string): string {
  const trimmed = raw.trim();

  // 尝试匹配 ```json ... ``` 格式
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
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

/** 将质量分限制在 1-5 范围 */
function clampScore(score: unknown): number {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 0;
  return Math.max(1, Math.min(5, Math.round(score)));
}

/** 解析 issues 数组 */
function parseIssues(issues: unknown): ReviewResult['issues'] {
  if (!Array.isArray(issues)) return [];

  const validCategories = new Set(['safety', 'accuracy', 'completeness', 'clarity']);
  const validSeverities = new Set(['high', 'medium', 'low']);

  return issues
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .filter((item) => validCategories.has(item.category as string))
    .filter((item) => validSeverities.has(item.severity as string))
    .map((item) => ({
      category: item.category as ReviewResult['issues'][number]['category'],
      description: typeof item.description === 'string' ? item.description : '',
      severity: item.severity as ReviewResult['issues'][number]['severity'],
    }));
}

/** 解析 suggestions 数组 */
function parseSuggestions(suggestions: unknown): string[] {
  if (!Array.isArray(suggestions)) return [];
  return suggestions.filter((s): s is string => typeof s === 'string');
}

/** 构建错误态 ReflectionArtifact */
function buildErrorReflection(
  input: ReflectionObserverInput,
  errorMessage: string,
): ReflectionArtifact {
  return {
    envelopeSnapshot: input.envelope,
    verificationReport: input.report,
    reviewResult: {
      approved: false,
      qualityScore: 0,
      issues: [
        {
          category: 'accuracy',
          description: `Reflection 审核失败: ${errorMessage}`,
          severity: 'high',
        },
      ],
      suggestions: [],
    },
    reviewerModel: 'error',
    reflectedAt: new Date().toISOString(),
  };
}
