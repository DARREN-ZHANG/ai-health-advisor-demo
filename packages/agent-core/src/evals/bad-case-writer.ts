import type { AgentRequest } from '../types/agent-request';
import type { QualityViolation } from '../output/verification-report';
import type { ReflectionArtifact, ReflectionIssue } from '../output/reflection-types';
import type {
  AgentEvalCase,
  AgentEvalExpectations,
  EvalCategory,
  EvalPriority,
  EvalSuite,
} from './types';

// ── Bad Case 产物 ─────────────────────────────────────

export interface BadCaseArtifact {
  /** 原始请求 */
  request: AgentRequest;
  /** verifier 发现的 violations */
  violations: QualityViolation[];
  /** reflection 发现的问题 */
  reflectionIssues: ReflectionIssue[];
  /** 可转换为 eval case 的 JSON */
  suggestedEvalCase: AgentEvalCase;
}

// ── 转换函数 ──────────────────────────────────────────

/**
 * 将 verification report 和 reflection artifact 转换为可用的 bad case eval。
 * 输出符合 AgentEvalCase schema。
 */
export function convertToBadCase(
  request: AgentRequest,
  report: { violations: QualityViolation[] },
  reflection: ReflectionArtifact,
): BadCaseArtifact {
  const violations = report.violations.filter((v) => !v.passed);
  const issues = reflection.reviewResult.issues;

  const expectations = buildExpectationsFromViolations(violations, issues);
  const suggestedEvalCase: AgentEvalCase = {
    id: `bad-case-${Date.now()}`,
    title: buildTitle(issues, violations),
    suite: 'regression' as EvalSuite,
    category: inferCategory(request),
    priority: inferPriority(issues, violations),
    tags: ['auto-generated', 'bad-case'],
    setup: { profileId: request.profileId },
    request,
    expectations,
  };

  return {
    request,
    violations,
    reflectionIssues: issues,
    suggestedEvalCase,
  };
}

// ── 内部工具函数 ──────────────────────────────────────

/** 从 violations 和 reflection issues 构建 expectations */
function buildExpectationsFromViolations(
  violations: QualityViolation[],
  issues: ReflectionIssue[],
): AgentEvalExpectations {
  const expectations: AgentEvalExpectations = {};

  // 安全类问题 → safety expectations
  const safetyViolations = violations.filter((v) => v.ruleId.startsWith('safety:'));
  const safetyIssues = issues.filter((i) => i.category === 'safety');
  if (safetyViolations.length > 0 || safetyIssues.length > 0) {
    expectations.safety = {
      forbidDiagnosis: safetyViolations.some((v) => v.ruleId.includes('diagnosis')),
      forbidMedicationRecommendation: safetyViolations.some((v) => v.ruleId.includes('medication_recommendation')),
      forbidMedication: safetyViolations.some((v) => v.ruleId.includes('medication') && !v.ruleId.includes('recommendation')),
      forbidTreatmentPromise: safetyViolations.some((v) => v.ruleId.includes('treatment_promise')),
      forbiddenPatterns: safetyIssues.map((i) => i.description),
    };
  }

  // 缺失数据类问题 → missingData expectations
  const missingDataViolations = violations.filter((v) => v.ruleId.startsWith('missing-data:'));
  if (missingDataViolations.length > 0) {
    const missingMetrics = missingDataViolations
      .filter((v) => v.ruleId.includes(':no_claim:'))
      .map((v) => {
        const parts = v.ruleId.split(':');
        return parts[parts.length - 1] ?? '';
      })
      .filter((s) => s !== '');
    expectations.missingData = {
      missingMetrics,
      mustDiscloseInsufficientData: missingDataViolations.some(
        (v) => v.ruleId === 'missing-data:insufficient_disclosure',
      ),
      forbiddenClaimPatterns: [],
    };
  }

  // 完整性类问题 → summary expectations
  const completenessIssues = issues.filter((i) => i.category === 'completeness');
  if (completenessIssues.length > 0) {
    expectations.summary = {
      mustNotMention: completenessIssues
        .filter((i) => i.severity === 'high')
        .map((i) => i.description),
    };
  }

  // 协议类期望
  expectations.protocol = {
    requireValidEnvelope: true,
  };

  return expectations;
}

/** 生成 bad case 标题 */
function buildTitle(issues: ReflectionIssue[], violations: QualityViolation[]): string {
  if (issues.length > 0) {
    const descriptions = issues.slice(0, 3).map((i) => i.description);
    return `自动生成: ${descriptions.join('; ')}`;
  }
  const failedViolations = violations.filter((v) => !v.passed);
  if (failedViolations.length > 0) {
    const messages = failedViolations.slice(0, 3).map((v) => v.message);
    return `自动生成: ${messages.join('; ')}`;
  }
  return '自动生成: 质量审核未通过';
}

/** 从 request 推断 eval category */
function inferCategory(request: AgentRequest): EvalCategory {
  const taskType = request.taskType;
  if (taskType === 'homepage_summary') return 'homepage';
  if (taskType === 'view_summary') return 'view-summary';
  if (taskType === 'advisor_chat') return 'advisor-chat';
  return 'cross-cutting';
}

/** 从 issues 和 violations 推断优先级 */
function inferPriority(issues: ReflectionIssue[], violations: QualityViolation[]): EvalPriority {
  // 有 high severity 问题或 hard failure → P0
  const hasHighSeverity = issues.some((i) => i.severity === 'high');
  const hasHardFailure = violations.some((v) => !v.passed && v.severity === 'hard');
  if (hasHighSeverity || hasHardFailure) return 'P0';

  // 有 medium 或 soft failure → P1
  const hasMediumSeverity = issues.some((i) => i.severity === 'medium');
  if (hasMediumSeverity) return 'P1';

  return 'P2';
}
