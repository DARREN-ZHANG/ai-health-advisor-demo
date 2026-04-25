import type { AgentResponseEnvelope } from '@health-advisor/shared';
import type { EvalCheckResult, EvalScorerInput } from '../types';

// ── Task Scorer ────────────────────────────────────────

/**
 * 场景特定检查：
 *
 * Homepage：
 * - requireRecentEventFirst：summary 前 40 字符内命中 recentEventPatterns
 * - require24hCrossAnalysis：同时命中 crossAnalysisPatterns.event 和 metric
 *
 * View Summary：
 * - requiredTab：summary 命中 requiredTabPatterns
 * - forbidOtherTabs：不得提无关 tab 的核心词
 *
 * Advisor Chat：
 * - mustAnswerUserQuestion：命中 answerPatterns
 * - requiredTimeScope：命中 requiredTimeScopePatterns
 *
 * 所有可变语义由 case JSON 的 patterns 表达，
 * scorer 中不硬编码事件/指标同义词。
 *
 * 匹配范围：summary + microTips 拼接
 */
export const taskScorer = {
  id: 'task',

  score(input: EvalScorerInput): EvalCheckResult[] {
    const { evalCase, envelope } = input;
    const taskSpecific = evalCase.expectations.taskSpecific;
    const results: EvalCheckResult[] = [];

    // 没有 taskSpecific 期望或没有 envelope，跳过
    if (!taskSpecific || !envelope) {
      return results;
    }

    const matchText = buildMatchText(envelope);

    // Homepage 检查
    if (taskSpecific.homepage) {
      results.push(...checkHomepage(evalCase.id, matchText, envelope, taskSpecific.homepage));
    }

    // View Summary 检查
    if (taskSpecific.viewSummary) {
      results.push(...checkViewSummary(evalCase.id, matchText, taskSpecific.viewSummary));
    }

    // Advisor Chat 检查
    if (taskSpecific.advisorChat) {
      results.push(...checkAdvisorChat(evalCase.id, matchText, taskSpecific.advisorChat));
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

/** Homepage 场景检查 */
function checkHomepage(
  caseId: string,
  text: string,
  envelope: AgentResponseEnvelope,
  homepage: NonNullable<NonNullable<import('../types').AgentEvalExpectations['taskSpecific']>['homepage']>,
): EvalCheckResult[] {
  const results: EvalCheckResult[] = [];

  // 检查 1：requireRecentEventFirst - summary 前 40 字符内命中 recentEventPatterns
  if (homepage.requireRecentEventFirst) {
    results.push(checkRecentEventFirst(caseId, envelope.summary, homepage.recentEventPatterns ?? []));
  }

  // 检查 2：require24hCrossAnalysis - 同时命中 event 和 metric
  if (homepage.require24hCrossAnalysis) {
    results.push(check24hCrossAnalysis(caseId, text, homepage.crossAnalysisPatterns));
  }

  return results;
}

/** 检查 summary 前 40 字符内命中 recentEventPatterns */
function checkRecentEventFirst(
  caseId: string,
  summary: string,
  patterns: string[],
): EvalCheckResult {
  if (patterns.length === 0) {
    return {
      checkId: `${caseId}:task:homepage:recent_event_first`,
      severity: 'hard',
      passed: false,
      score: 0,
      maxScore: 1,
      message: 'requireRecentEventFirst 为 true 但缺少 recentEventPatterns',
      details: { reason: 'missing_recent_event_patterns' },
    };
  }

  const summaryHead = summary.slice(0, 40);
  const matched = patterns.filter((pattern) => new RegExp(pattern).test(summaryHead));
  const hit = matched.length > 0;
  return {
    checkId: `${caseId}:task:homepage:recent_event_first`,
    severity: 'hard',
    passed: hit,
    score: hit ? 1 : 0,
    maxScore: 1,
    message: hit
      ? `summary 前 40 字符命中 recentEventPatterns`
      : 'summary 前 40 字符未命中任何 recentEventPatterns',
    details: hit ? { matched, summaryHead } : { patterns, summaryHead },
  };
}

/** 检查 24h 交叉分析同时命中 event 和 metric */
function check24hCrossAnalysis(
  caseId: string,
  text: string,
  crossAnalysisPatterns?: { event?: string[]; metric?: string[] },
): EvalCheckResult {
  const eventPatterns = crossAnalysisPatterns?.event ?? [];
  const metricPatterns = crossAnalysisPatterns?.metric ?? [];

  if (eventPatterns.length === 0 || metricPatterns.length === 0) {
    return {
      checkId: `${caseId}:task:homepage:cross_analysis_24h`,
      severity: 'hard',
      passed: false,
      score: 0,
      maxScore: 1,
      message: 'require24hCrossAnalysis 为 true 但 crossAnalysisPatterns 配置不完整',
      details: { reason: 'incomplete_cross_analysis_patterns' },
    };
  }

  const eventHit = eventPatterns.some((pattern) => new RegExp(pattern).test(text));
  const metricHit = metricPatterns.some((pattern) => new RegExp(pattern).test(text));
  const passed = eventHit && metricHit;

  return {
    checkId: `${caseId}:task:homepage:cross_analysis_24h`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? '24h 交叉分析同时命中 event 和 metric'
      : `24h 交叉分析未同时命中 event 和 metric (event=${eventHit}, metric=${metricHit})`,
    details: passed ? undefined : { eventHit, metricHit },
  };
}

/** View Summary 场景检查 */
function checkViewSummary(
  caseId: string,
  text: string,
  viewSummary: NonNullable<NonNullable<import('../types').AgentEvalExpectations['taskSpecific']>['viewSummary']>,
): EvalCheckResult[] {
  const results: EvalCheckResult[] = [];

  // 检查 1：requiredTab - summary 命中 requiredTabPatterns
  if (viewSummary.requiredTab) {
    results.push(checkRequiredTab(caseId, text, viewSummary.requiredTab, viewSummary.requiredTabPatterns ?? []));
  }

  // 检查 2：forbidOtherTabs - 不得提无关 tab 的核心词
  if (viewSummary.forbidOtherTabs && viewSummary.forbidOtherTabs.length > 0) {
    results.push(checkForbidOtherTabs(caseId, text, viewSummary.forbidOtherTabs));
  }

  return results;
}

/** 检查 summary 命中 requiredTabPatterns */
function checkRequiredTab(
  caseId: string,
  text: string,
  requiredTab: string,
  patterns: string[],
): EvalCheckResult {
  if (patterns.length === 0) {
    return {
      checkId: `${caseId}:task:view_summary:required_tab`,
      severity: 'hard',
      passed: false,
      score: 0,
      maxScore: 1,
      message: `requiredTab 为 "${requiredTab}" 但缺少 requiredTabPatterns`,
      details: { requiredTab, reason: 'missing_required_tab_patterns' },
    };
  }

  const hit = patterns.some((pattern) => new RegExp(pattern).test(text));
  return {
    checkId: `${caseId}:task:view_summary:required_tab`,
    severity: 'hard',
    passed: hit,
    score: hit ? 1 : 0,
    maxScore: 1,
    message: hit
      ? `已命中 requiredTab "${requiredTab}" 对应的 pattern`
      : `未命中 requiredTab "${requiredTab}" 对应的 pattern`,
    details: hit ? undefined : { requiredTab, patterns },
  };
}

/** 检查不得提无关 tab 的核心词 */
function checkForbidOtherTabs(
  caseId: string,
  text: string,
  forbiddenPatterns: string[],
): EvalCheckResult {
  const matched = forbiddenPatterns.filter((pattern) => new RegExp(pattern).test(text));
  const passed = matched.length === 0;
  return {
    checkId: `${caseId}:task:view_summary:forbid_other_tabs`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? '未提及无关 tab 的核心词'
      : `提及了无关 tab 的核心词: ${matched.join(', ')}`,
    details: passed ? undefined : { matched },
  };
}

/** Advisor Chat 场景检查 */
function checkAdvisorChat(
  caseId: string,
  text: string,
  advisorChat: NonNullable<NonNullable<import('../types').AgentEvalExpectations['taskSpecific']>['advisorChat']>,
): EvalCheckResult[] {
  const results: EvalCheckResult[] = [];

  // 检查 1：mustAnswerUserQuestion - 命中 answerPatterns
  if (advisorChat.mustAnswerUserQuestion) {
    results.push(checkMustAnswerUserQuestion(caseId, text, advisorChat.answerPatterns ?? []));
  }

  // 检查 2：requiredTimeScope - 命中 requiredTimeScopePatterns
  if (advisorChat.requiredTimeScope) {
    results.push(checkRequiredTimeScope(caseId, text, advisorChat.requiredTimeScope, advisorChat.requiredTimeScopePatterns ?? []));
  }

  return results;
}

/** 检查命中 answerPatterns */
function checkMustAnswerUserQuestion(
  caseId: string,
  text: string,
  patterns: string[],
): EvalCheckResult {
  if (patterns.length === 0) {
    return {
      checkId: `${caseId}:task:advisor_chat:answer_question`,
      severity: 'hard',
      passed: false,
      score: 0,
      maxScore: 1,
      message: 'mustAnswerUserQuestion 为 true 但缺少 answerPatterns',
      details: { reason: 'missing_answer_patterns' },
    };
  }

  const hit = patterns.some((pattern) => new RegExp(pattern).test(text));
  return {
    checkId: `${caseId}:task:advisor_chat:answer_question`,
    severity: 'hard',
    passed: hit,
    score: hit ? 1 : 0,
    maxScore: 1,
    message: hit
      ? '已命中 answerPatterns'
      : '未命中任何 answerPatterns',
    details: hit ? undefined : { patterns },
  };
}

/** 检查命中 requiredTimeScopePatterns */
function checkRequiredTimeScope(
  caseId: string,
  text: string,
  timeScope: string,
  patterns: string[],
): EvalCheckResult {
  if (patterns.length === 0) {
    return {
      checkId: `${caseId}:task:advisor_chat:time_scope`,
      severity: 'hard',
      passed: false,
      score: 0,
      maxScore: 1,
      message: `requiredTimeScope 为 "${timeScope}" 但缺少 requiredTimeScopePatterns`,
      details: { timeScope, reason: 'missing_required_time_scope_patterns' },
    };
  }

  const hit = patterns.some((pattern) => new RegExp(pattern).test(text));
  return {
    checkId: `${caseId}:task:advisor_chat:time_scope`,
    severity: 'hard',
    passed: hit,
    score: hit ? 1 : 0,
    maxScore: 1,
    message: hit
      ? `已命中 requiredTimeScope "${timeScope}" 对应的 pattern`
      : `未命中 requiredTimeScope "${timeScope}" 对应的 pattern`,
    details: hit ? undefined : { timeScope, patterns },
  };
}
