import type { AgentResponseEnvelope } from '@health-advisor/shared';
import type { EvalCheckResult, EvalScorerInput } from '../types';

// ── Mention Scorer ──────────────────────────────────────

/**
 * 关键词/模式提及检查：
 * - mustMention：全部包含
 * - mustMentionAny：每组至少命中一个
 * - mustNotMention：全部不出现
 * - requiredPatterns：全部正则匹配
 * - forbiddenPatterns：全部不匹配
 *
 * 匹配范围：summary + microTips 拼接
 */
export const mentionScorer = {
  id: 'mention',

  score(input: EvalScorerInput): EvalCheckResult[] {
    const { evalCase, envelope } = input;
    const summary = evalCase.expectations.summary;
    const results: EvalCheckResult[] = [];

    // 没有 summary 期望中的 mention 相关配置，跳过
    if (!summary || !envelope) {
      return results;
    }

    const hasMentionChecks =
      (summary.mustMention && summary.mustMention.length > 0) ||
      (summary.mustMentionAny && summary.mustMentionAny.length > 0) ||
      (summary.mustNotMention && summary.mustNotMention.length > 0) ||
      (summary.requiredPatterns && summary.requiredPatterns.length > 0) ||
      (summary.forbiddenPatterns && summary.forbiddenPatterns.length > 0);

    if (!hasMentionChecks) {
      return results;
    }

    const matchText = buildMatchText(envelope);

    // 检查 1：mustMention 全部包含
    if (summary.mustMention && summary.mustMention.length > 0) {
      results.push(checkMustMention(evalCase.id, matchText, summary.mustMention));
    }

    // 检查 2：mustMentionAny 每组至少命中一个
    if (summary.mustMentionAny && summary.mustMentionAny.length > 0) {
      results.push(checkMustMentionAny(evalCase.id, matchText, summary.mustMentionAny));
    }

    // 检查 3：mustNotMention 全部不出现
    if (summary.mustNotMention && summary.mustNotMention.length > 0) {
      results.push(checkMustNotMention(evalCase.id, matchText, summary.mustNotMention));
    }

    // 检查 4：requiredPatterns 全部匹配
    if (summary.requiredPatterns && summary.requiredPatterns.length > 0) {
      results.push(checkRequiredPatterns(evalCase.id, matchText, summary.requiredPatterns));
    }

    // 检查 5：forbiddenPatterns 全部不匹配
    if (summary.forbiddenPatterns && summary.forbiddenPatterns.length > 0) {
      results.push(checkForbiddenPatterns(evalCase.id, matchText, summary.forbiddenPatterns));
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

/** 检查 mustMention 全部包含 */
function checkMustMention(
  caseId: string,
  text: string,
  mustMention: string[],
): EvalCheckResult {
  const missing = mustMention.filter((keyword) => !text.includes(keyword));
  const passed = missing.length === 0;
  return {
    checkId: `${caseId}:mention:must_mention`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? '所有 mustMention 关键词均已出现'
      : `缺少 mustMention 关键词: ${missing.join(', ')}`,
    details: passed ? undefined : { missing },
  };
}

/** 检查 mustMentionAny 每组至少命中一个 */
function checkMustMentionAny(
  caseId: string,
  text: string,
  mustMentionAny: string[][],
): EvalCheckResult {
  const groupResults = mustMentionAny.map((group) =>
    group.some((keyword) => text.includes(keyword)),
  );
  const failedGroups = groupResults
    .map((hit, idx) => (!hit ? idx : -1))
    .filter((idx) => idx >= 0);
  const passed = failedGroups.length === 0;

  const failedDescriptions = failedGroups
    .map((i) => mustMentionAny[i]!.join('|'))
    .join('], [');
  return {
    checkId: `${caseId}:mention:must_mention_any`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? '所有 mustMentionAny 组均命中'
      : `mustMentionAny 第 ${failedGroups.map((i) => i + 1).join(', ')} 组未命中: [${failedDescriptions}]`,
    details: passed
      ? undefined
      : { failedGroups: failedGroups.map((i) => mustMentionAny[i]!) },
  };
}

/** 检查 mustNotMention 全部不出现 */
function checkMustNotMention(
  caseId: string,
  text: string,
  mustNotMention: string[],
): EvalCheckResult {
  const found = mustNotMention.filter((keyword) => text.includes(keyword));
  const passed = found.length === 0;
  return {
    checkId: `${caseId}:mention:must_not_mention`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? '无 mustNotMention 关键词出现'
      : `出现 mustNotMention 关键词: ${found.join(', ')}`,
    details: passed ? undefined : { found },
  };
}

/** 检查 requiredPatterns 全部正则匹配 */
function checkRequiredPatterns(
  caseId: string,
  text: string,
  requiredPatterns: string[],
): EvalCheckResult {
  const unmatched = requiredPatterns.filter((pattern) => {
    const regex = new RegExp(pattern);
    return !regex.test(text);
  });
  const passed = unmatched.length === 0;
  return {
    checkId: `${caseId}:mention:required_patterns`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? '所有 requiredPatterns 均匹配'
      : `requiredPatterns 未匹配: ${unmatched.join(', ')}`,
    details: passed ? undefined : { unmatched },
  };
}

/** 检查 forbiddenPatterns 全部不匹配 */
function checkForbiddenPatterns(
  caseId: string,
  text: string,
  forbiddenPatterns: string[],
): EvalCheckResult {
  const matched = forbiddenPatterns.filter((pattern) => {
    const regex = new RegExp(pattern);
    return regex.test(text);
  });
  const passed = matched.length === 0;
  return {
    checkId: `${caseId}:mention:forbidden_patterns`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? '无 forbiddenPatterns 匹配'
      : `forbiddenPatterns 命中: ${matched.join(', ')}`,
    details: passed ? undefined : { matched },
  };
}
