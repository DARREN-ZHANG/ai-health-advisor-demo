import type { AgentResponseEnvelope } from '@health-advisor/shared';
import type { EvalCheckResult, EvalScorerInput } from '../types';

// ── Evidence Scorer ─────────────────────────────────────

/**
 * 证据检查：
 * - evidence.requiredFacts 中每条 fact 的 mentionPatterns 必须至少命中一个
 * - evidence.forbiddenFacts 中任一 pattern 不得命中
 * - metric/value/unit 只用于报告可读性，不自动生成规则
 * - 如果 required fact 缺少 mentionPatterns，返回 hard failure 作为防线
 *
 * 匹配范围：summary + microTips 拼接
 */
export const evidenceScorer = {
  id: 'evidence',

  score(input: EvalScorerInput): EvalCheckResult[] {
    const { evalCase, envelope } = input;
    const evidence = evalCase.expectations.evidence;
    const results: EvalCheckResult[] = [];

    // 没有 evidence 期望或没有 envelope，跳过
    if (!evidence || !envelope) {
      return results;
    }

    const hasEvidenceChecks =
      (evidence.requiredFacts && evidence.requiredFacts.length > 0) ||
      (evidence.forbiddenFacts && evidence.forbiddenFacts.length > 0);

    if (!hasEvidenceChecks) {
      return results;
    }

    const matchText = buildMatchText(envelope);

    // 检查 1：requiredFacts 每条 fact 的 mentionPatterns 至少命中一个
    if (evidence.requiredFacts && evidence.requiredFacts.length > 0) {
      for (const fact of evidence.requiredFacts) {
        results.push(checkRequiredFact(evalCase.id, matchText, fact));
      }
    }

    // 检查 2：forbiddenFacts 任一 pattern 不得命中
    if (evidence.forbiddenFacts && evidence.forbiddenFacts.length > 0) {
      for (const fact of evidence.forbiddenFacts) {
        results.push(checkForbiddenFact(evalCase.id, matchText, fact));
      }
    }

    return results;
  },
} as const;

// ── 内部工具函数 ──────────────────────────────────────────

/** 构建匹配文本：summary + microTips 拼接 */
function buildMatchText(envelope: AgentResponseEnvelope): string {
  const parts = [envelope.summary];
  if (envelope.microTips.length > 0) {
    parts.push(envelope.microTips.join('\n'));
  }
  return parts.join('\n');
}

/** 检查单条 required fact 的 mentionPatterns 是否至少命中一个 */
function checkRequiredFact(
  caseId: string,
  text: string,
  fact: {
    id: string;
    metric?: string;
    eventType?: string;
    value?: number | string;
    unit?: string;
    mentionPatterns?: string[];
  },
): EvalCheckResult {
  // 防线：如果没有 mentionPatterns，直接 hard failure
  if (!fact.mentionPatterns || fact.mentionPatterns.length === 0) {
    return {
      checkId: `${caseId}:evidence:required_fact:${fact.id}`,
      severity: 'hard',
      passed: false,
      score: 0,
      maxScore: 1,
      message: `required fact "${fact.id}" 缺少 mentionPatterns，无法验证`,
      details: { factId: fact.id, reason: 'missing_mention_patterns' },
    };
  }

  const hit = fact.mentionPatterns.some((pattern) => new RegExp(pattern).test(text));
  return {
    checkId: `${caseId}:evidence:required_fact:${fact.id}`,
    severity: 'hard',
    passed: hit,
    score: hit ? 1 : 0,
    maxScore: 1,
    message: hit
      ? `required fact "${fact.id}" 已命中`
      : `required fact "${fact.id}" 未命中任何 mentionPatterns`,
    details: hit
      ? undefined
      : { factId: fact.id, mentionPatterns: fact.mentionPatterns },
  };
}

/** 检查单条 forbidden fact 的 mentionPatterns 不得命中 */
function checkForbiddenFact(
  caseId: string,
  text: string,
  fact: {
    id: string;
    mentionPatterns: string[];
  },
): EvalCheckResult {
  const matched = fact.mentionPatterns.filter((pattern) => new RegExp(pattern).test(text));
  const passed = matched.length === 0;
  return {
    checkId: `${caseId}:evidence:forbidden_fact:${fact.id}`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? `forbidden fact "${fact.id}" 未命中`
      : `forbidden fact "${fact.id}" 命中了禁止 pattern: ${matched.join(', ')}`,
    details: passed ? undefined : { factId: fact.id, matched },
  };
}
