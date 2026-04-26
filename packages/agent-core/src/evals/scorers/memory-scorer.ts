import type { AgentResponseEnvelope } from '@health-advisor/shared';
import type { EvalCheckResult, EvalScorerInput } from '../types';

// ── Memory Scorer ──────────────────────────────────────

/**
 * 记忆使用检查：
 * - requiredMemoryPatterns：必须至少命中一个 pattern
 * - forbiddenLeakPatterns：任一 pattern 不得命中
 * - mustUsePreviousTurn：为 true 时，至少命中一个 requiredMemoryPatterns
 *
 * 判断"是否使用了记忆"由 case expectations 显式配置，
 * scorer 不做自动推断。
 *
 * 匹配范围：summary + microTips 拼接
 */
export const memoryScorer = {
  id: 'memory',

  score(input: EvalScorerInput): EvalCheckResult[] {
    const { evalCase, envelope } = input;
    const memory = evalCase.expectations.memory;
    const results: EvalCheckResult[] = [];

    // 没有 memory 期望或没有 envelope，跳过
    if (!memory || !envelope) {
      return results;
    }

    const hasMemoryChecks =
      (memory.requiredMemoryPatterns && memory.requiredMemoryPatterns.length > 0) ||
      (memory.forbiddenLeakPatterns && memory.forbiddenLeakPatterns.length > 0) ||
      memory.mustUsePreviousTurn === true;

    if (!hasMemoryChecks) {
      return results;
    }

    const matchText = buildMatchText(envelope);

    // 检查 1：requiredMemoryPatterns 必须至少命中一个
    if (memory.requiredMemoryPatterns && memory.requiredMemoryPatterns.length > 0) {
      results.push(checkRequiredMemoryPatterns(evalCase.id, matchText, memory.requiredMemoryPatterns));
    }

    // 检查 2：forbiddenLeakPatterns 任一 pattern 不得命中
    if (memory.forbiddenLeakPatterns && memory.forbiddenLeakPatterns.length > 0) {
      results.push(checkForbiddenLeakPatterns(evalCase.id, matchText, memory.forbiddenLeakPatterns));
    }

    // 检查 3：mustUsePreviousTurn 要求至少命中一个 requiredMemoryPatterns
    if (memory.mustUsePreviousTurn === true) {
      // requiredMemoryPatterns 是必要前提，没有则直接 hard failure
      const patterns = memory.requiredMemoryPatterns ?? [];
      results.push(checkMustUsePreviousTurn(evalCase.id, matchText, patterns));
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

/** 检查 requiredMemoryPatterns 至少命中一个 */
function checkRequiredMemoryPatterns(
  caseId: string,
  text: string,
  patterns: string[],
): EvalCheckResult {
  const matched = patterns.filter((pattern) => new RegExp(pattern).test(text));
  const hit = matched.length > 0;
  return {
    checkId: `${caseId}:memory:required_memory_patterns`,
    severity: 'hard',
    passed: hit,
    score: hit ? 1 : 0,
    maxScore: 1,
    message: hit
      ? `requiredMemoryPatterns 已命中 ${matched.length} 个`
      : 'requiredMemoryPatterns 未命中任何 pattern',
    details: hit ? { matchedCount: matched.length } : { patterns },
  };
}

/** 检查 forbiddenLeakPatterns 任一 pattern 不得命中 */
function checkForbiddenLeakPatterns(
  caseId: string,
  text: string,
  patterns: string[],
): EvalCheckResult {
  const matched = patterns.filter((pattern) => new RegExp(pattern).test(text));
  const passed = matched.length === 0;
  return {
    checkId: `${caseId}:memory:forbidden_leak_patterns`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? '无 profile 泄漏 pattern 命中'
      : `profile 泄漏 pattern 命中: ${matched.join(', ')}`,
    details: passed ? undefined : { matched },
  };
}

/** 检查 mustUsePreviousTurn 要求至少命中一个 memory pattern */
function checkMustUsePreviousTurn(
  caseId: string,
  text: string,
  patterns: string[],
): EvalCheckResult {
  // 没有 requiredMemoryPatterns 提供参照，直接 hard failure
  if (patterns.length === 0) {
    return {
      checkId: `${caseId}:memory:must_use_previous_turn`,
      severity: 'hard',
      passed: false,
      score: 0,
      maxScore: 1,
      message: 'mustUsePreviousTurn 为 true 但缺少 requiredMemoryPatterns',
      details: { reason: 'missing_required_memory_patterns' },
    };
  }

  const hit = patterns.some((pattern) => new RegExp(pattern).test(text));
  return {
    checkId: `${caseId}:memory:must_use_previous_turn`,
    severity: 'hard',
    passed: hit,
    score: hit ? 1 : 0,
    maxScore: 1,
    message: hit
      ? '已使用记忆（命中 requiredMemoryPatterns）'
      : 'mustUsePreviousTurn 为 true 但未命中任何 requiredMemoryPatterns',
    details: hit ? undefined : { patterns },
  };
}
