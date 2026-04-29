import { AgentResponseEnvelopeSchema } from '@health-advisor/shared';
import type { EvalCheckResult, EvalScorerInput } from '../types';

// ── Protocol Scorer ──────────────────────────────────────

/**
 * 协议合规性检查：
 * - envelope 存在
 * - AgentResponseEnvelopeSchema.safeParse 通过
 * - meta.taskType 与 request taskType 匹配
 * - meta.pageContext.profileId 与 request profileId 匹配
 * - expectedFinishReason 匹配
 * - expectedSource 匹配
 */
export const protocolScorer = {
  id: 'protocol',

  score(input: EvalScorerInput): EvalCheckResult[] {
    const { evalCase, envelope } = input;
    const protocol = evalCase.expectations.protocol;
    const results: EvalCheckResult[] = [];

    // 如果没有 protocol 期望且 envelope 不存在，跳过
    if (!protocol && !envelope) {
      return results;
    }

    // 检查 1：envelope 是否存在
    const envelopeExists = checkEnvelopeExists(evalCase.id, envelope);
    results.push(envelopeExists);
    if (!envelopeExists.passed) {
      // envelope 不存在，后续检查无法执行，直接返回
      return results;
    }

    // 检查 2：schema 校验是否通过
    const schemaResult = checkSchemaValid(evalCase.id, envelope!);
    results.push(schemaResult);
    if (!schemaResult.passed) {
      // schema 不通过，后续字段级检查不可靠，直接返回
      return results;
    }

    // 检查 3：taskType 匹配
    results.push(checkTaskTypeMatch(evalCase.id, evalCase, envelope!));

    // 检查 4：profileId 匹配
    results.push(checkProfileIdMatch(evalCase.id, evalCase, envelope!));

    // 检查 5：finishReason 匹配
    if (protocol?.expectedFinishReason !== undefined) {
      results.push(checkFinishReason(evalCase.id, evalCase, envelope!));
    }

    // 检查 6：source 匹配
    if (protocol?.expectedSource !== undefined) {
      results.push(checkSource(evalCase.id, evalCase, envelope!));
    }

    return results;
  },
} as const;

// ── 内部检查函数 ──────────────────────────────────────────

/** 检查 envelope 是否存在 */
function checkEnvelopeExists(caseId: string, envelope: unknown): EvalCheckResult {
  const passed = envelope != null;
  return {
    checkId: `${caseId}:protocol:envelope_exists`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed ? 'envelope 存在' : 'envelope 不存在',
  };
}

/** 使用 Zod schema 校验 envelope 结构 */
function checkSchemaValid(caseId: string, envelope: NonNullable<EvalScorerInput['envelope']>): EvalCheckResult {
  const parseResult = AgentResponseEnvelopeSchema.safeParse(envelope);
  const passed = parseResult.success;
  return {
    checkId: `${caseId}:protocol:schema_valid`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? 'envelope schema 校验通过'
      : `envelope schema 校验失败: ${parseResult.error.message}`,
    details: passed ? undefined : { zodError: parseResult.error.issues },
  };
}

/** 检查 meta.taskType 与 request.taskType 是否一致 */
function checkTaskTypeMatch(
  caseId: string,
  evalCase: EvalScorerInput['evalCase'],
  envelope: NonNullable<EvalScorerInput['envelope']>,
): EvalCheckResult {
  const expected = evalCase.request.taskType;
  const actual = envelope.meta.taskType;
  const passed = actual === expected;
  return {
    checkId: `${caseId}:protocol:task_type_match`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? `taskType 匹配: ${expected}`
      : `taskType 不匹配: 期望 ${expected}, 实际 ${actual}`,
  };
}

/** 检查 meta.pageContext.profileId 与 request.profileId 是否一致 */
function checkProfileIdMatch(
  caseId: string,
  evalCase: EvalScorerInput['evalCase'],
  envelope: NonNullable<EvalScorerInput['envelope']>,
): EvalCheckResult {
  const expected = evalCase.request.profileId;
  const actual = envelope.meta.pageContext.profileId;
  const passed = actual === expected;
  return {
    checkId: `${caseId}:protocol:profile_id_match`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? `profileId 匹配: ${expected}`
      : `profileId 不匹配: 期望 ${expected}, 实际 ${actual}`,
  };
}

/** 检查 finishReason 是否匹配 */
function checkFinishReason(
  caseId: string,
  evalCase: EvalScorerInput['evalCase'],
  envelope: NonNullable<EvalScorerInput['envelope']>,
): EvalCheckResult {
  const expected = evalCase.expectations.protocol?.expectedFinishReason;
  const actual = envelope.meta.finishReason;
  // 不做绕过，直接比较，让 case 暴露协议不一致问题
  const passed = actual === expected;
  return {
    checkId: `${caseId}:protocol:finish_reason`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? `finishReason 匹配: ${expected}`
      : `finishReason 不匹配: 期望 ${expected}, 实际 ${actual}`,
  };
}

/** 检查 envelope.source 是否匹配预期 */
function checkSource(
  caseId: string,
  evalCase: EvalScorerInput['evalCase'],
  envelope: NonNullable<EvalScorerInput['envelope']>,
): EvalCheckResult {
  const expected = evalCase.expectations.protocol?.expectedSource;
  const actual = envelope.source;
  const passed = actual === expected;
  return {
    checkId: `${caseId}:protocol:source_match`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? `source 匹配: ${expected}`
      : `source 不匹配: 期望 ${expected}, 实际 ${actual}`,
  };
}
