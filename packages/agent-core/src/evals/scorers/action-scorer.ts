import type { EvalCheckResult, EvalScorerInput } from '../types';

// ── Action Scorer ────────────────────────────────────────

/**
 * Action 选项检查：
 * - minCount/maxCount：检查数量范围
 * - checkActionFields：检查字段完整性
 * - requireAiPromise：检查 aiPromise 非空
 * - requiredPatterns：检查必须匹配的模式
 * - forbiddenPatterns：检查禁止匹配的模式
 */
export const actionScorer = {
  id: 'action',

  score(input: EvalScorerInput): EvalCheckResult[] {
    const { evalCase, envelope } = input;
    const actions = evalCase.expectations.actions;
    const results: EvalCheckResult[] = [];

    // 没有 actions 期望或没有 envelope，跳过
    if (!actions || !envelope) {
      return results;
    }

    const actionList = envelope.actions ?? [];

    // 检查 1：action 数量范围
    results.push(checkActionCount(evalCase.id, actionList, actions.minCount, actions.maxCount));

    // 检查 2：action 字段完整性
    results.push(checkActionFields(evalCase.id, actionList));

    // 检查 3：aiPromise 非空
    if (actions.requireAiPromise) {
      results.push(checkAiPromise(evalCase.id, actionList));
    }

    // 检查 4：requiredPatterns
    if (actions.requiredPatterns && actions.requiredPatterns.length > 0) {
      results.push(checkRequiredPatterns(evalCase.id, actionList, actions.requiredPatterns));
    }

    // 检查 5：forbiddenPatterns
    if (actions.forbiddenPatterns && actions.forbiddenPatterns.length > 0) {
      results.push(checkForbiddenPatterns(evalCase.id, actionList, actions.forbiddenPatterns));
    }

    return results;
  },
} as const;

// ── 内部检查函数 ──────────────────────────────────────────

/** 构建单个 action 的匹配文本 */
function buildActionText(action: { title: string; description: string; aiPromise: string }): string {
  return [action.title, action.description, action.aiPromise].join('\n');
}

/** 检查 action 数量是否在范围内 */
function checkActionCount(
  caseId: string,
  actions: unknown[],
  minCount?: number,
  maxCount?: number,
): EvalCheckResult {
  const count = actions.length;
  let passed = true;
  let message = `action 数量: ${count}`;

  if (minCount !== undefined && count < minCount) {
    passed = false;
    message = `action 数量不足: ${count} < ${minCount}`;
  }
  if (maxCount !== undefined && count > maxCount) {
    passed = false;
    message = `action 数量过多: ${count} > ${maxCount}`;
  }

  return {
    checkId: `${caseId}:action:count`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message,
    details: { count, minCount, maxCount },
  };
}

/** 检查 action 字段完整性 */
function checkActionFields(
  caseId: string,
  actions: Array<{ id?: string; emoji?: string; title?: string; description?: string; aiPromise?: string }>,
): EvalCheckResult {
  const invalidActions = actions
    .map((action, index) => {
      const missingFields: string[] = [];
      if (!action.id || String(action.id).trim() === '') missingFields.push('id');
      if (!action.emoji || String(action.emoji).trim() === '') missingFields.push('emoji');
      if (!action.title || String(action.title).trim() === '') missingFields.push('title');
      if (!action.description || String(action.description).trim() === '') missingFields.push('description');
      if (!action.aiPromise || String(action.aiPromise).trim() === '') missingFields.push('aiPromise');
      return missingFields.length > 0 ? { index, missingFields } : null;
    })
    .filter((item): item is { index: number; missingFields: string[] } => item !== null);

  const passed = invalidActions.length === 0;
  return {
    checkId: `${caseId}:action:fields`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? '所有 action 字段完整'
      : `存在字段不完整的 action: ${invalidActions.map((a) => `#${a.index + 1}[${a.missingFields.join(', ')}]`).join(', ')}`,
    details: passed ? undefined : { invalidActions },
  };
}

/** 检查 aiPromise 非空 */
function checkAiPromise(
  caseId: string,
  actions: Array<{ aiPromise?: string }>,
): EvalCheckResult {
  const emptyActions = actions
    .map((action, index) => (!action.aiPromise || action.aiPromise.trim() === '') ? index : -1)
    .filter((idx) => idx >= 0);

  const passed = emptyActions.length === 0;
  return {
    checkId: `${caseId}:action:ai_promise`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? '所有 action 的 aiPromise 非空'
      : `action #${emptyActions.map((i) => i + 1).join(', ')} 的 aiPromise 为空`,
    details: passed ? undefined : { emptyActions: emptyActions.map((i) => i + 1) },
  };
}

/** 检查 requiredPatterns 全部匹配 */
function checkRequiredPatterns(
  caseId: string,
  actions: Array<{ title: string; description: string; aiPromise: string }>,
  requiredPatterns: string[],
): EvalCheckResult {
  const actionTexts = actions.map(buildActionText);

  const unmatched = requiredPatterns.filter((pattern) => {
    const regex = new RegExp(pattern);
    return !actionTexts.some((text) => regex.test(text));
  });

  const passed = unmatched.length === 0;
  return {
    checkId: `${caseId}:action:required_patterns`,
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
  actions: Array<{ title: string; description: string; aiPromise: string }>,
  forbiddenPatterns: string[],
): EvalCheckResult {
  const actionTexts = actions.map(buildActionText);

  const matched = forbiddenPatterns.filter((pattern) => {
    const regex = new RegExp(pattern);
    return actionTexts.some((text) => regex.test(text));
  });

  const passed = matched.length === 0;
  return {
    checkId: `${caseId}:action:forbidden_patterns`,
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
