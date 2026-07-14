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
 * 匹配范围：summary + microTips + actions 拼接
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

/** 构建匹配文本：summary + microTips + actions 拼接 */
function buildMatchText(envelope: AgentResponseEnvelope): string {
  const parts = [envelope.summary];
  if (envelope.microTips && envelope.microTips.length > 0) {
    parts.push(envelope.microTips.join('\n'));
  }
  if (envelope.actions && envelope.actions.length > 0) {
    const actionTexts = envelope.actions.map((a) => `${a.title} ${a.description} ${a.aiPromise}`);
    parts.push(actionTexts.join('\n'));
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

  // 检查 3：requireEventWindowFacts - 命中事件窗口事实
  if (homepage.requireEventWindowFacts) {
    results.push(checkEventWindowFacts(caseId, text, homepage.eventWindowValuePatterns ?? []));
  }

  // 检查 4：forbidDailyStatusFirstPatterns - summary 开头不得以整日状态为主体
  if (homepage.forbidDailyStatusFirstPatterns && homepage.forbidDailyStatusFirstPatterns.length > 0) {
    results.push(checkDailyStatusNotFirst(caseId, envelope.summary, homepage.forbidDailyStatusFirstPatterns));
  }

  // 检查 5：forbidSummaryPatterns - summary 中不得出现指定 pattern
  if (homepage.forbidSummaryPatterns && homepage.forbidSummaryPatterns.length > 0) {
    results.push(...checkForbidSummaryPatterns(caseId, envelope.summary, homepage.forbidSummaryPatterns));
  }

  // 检查 6：forbidActionPatterns - actions 中不得出现指定 pattern
  if (homepage.forbidActionPatterns && homepage.forbidActionPatterns.length > 0) {
    const actionText = envelope.actions
      ? envelope.actions.map((action) => `${action.title}\n${action.description}\n${action.aiPromise}`).join('\n')
      : '';
    results.push(...checkForbidActionPatterns(caseId, actionText, homepage.forbidActionPatterns));
  }

  // 检查 7：requireProbabilisticEventLanguage - summary 使用概率措辞
  if (homepage.requireProbabilisticEventLanguage) {
    results.push(
      ...checkRequireProbabilisticEventLanguage(
        caseId,
        envelope.summary,
        homepage.requireProbabilisticEventLanguage,
      ),
    );
  }

  // 检查 8：forbidInternalDerivedScores - 禁止披露内部评分
  if (homepage.forbidInternalDerivedScores) {
    results.push(
      checkForbidInternalDerivedScores(
        caseId,
        text,
        homepage.forbidInternalDerivedScores.scorePatterns,
      ),
    );
  }

  // 检查 9：forbidCapabilityDisclosure - 禁止披露系统能力
  if (homepage.forbidCapabilityDisclosure) {
    results.push(
      checkForbidCapabilityDisclosure(
        caseId,
        text,
        homepage.forbidCapabilityDisclosure.capabilityPatterns,
      ),
    );
  }

  if (homepage.requiredDisplayUnits) {
    results.push(
      ...checkMetricDisplayUnits(
        caseId,
        text,
        homepage.requiredDisplayUnits,
        'required',
      ),
    );
  }

  if (homepage.forbiddenDisplayUnits) {
    results.push(
      ...checkMetricDisplayUnits(
        caseId,
        text,
        homepage.forbiddenDisplayUnits,
        'forbidden',
      ),
    );
  }

  return results;
}

type DisplayUnitExpectations = Record<
  string,
  { metricPatterns: string[]; unitPatterns: string[] }
>;

function checkMetricDisplayUnits(
  caseId: string,
  text: string,
  expectations: DisplayUnitExpectations,
  mode: 'required' | 'forbidden',
): EvalCheckResult[] {
  const fragments = text
    .split(/[。！？!?;；\n]+/)
    .map((fragment) => fragment.trim())
    .filter(Boolean);

  return Object.entries(expectations).map(([metric, config]) => {
    const metricFragments = fragments.filter(
      (fragment) =>
        /\d/.test(fragment) &&
        config.metricPatterns.some((pattern) => new RegExp(pattern, 'i').test(fragment)),
    );
    const violatingFragments = metricFragments.filter((fragment) => {
      const unitMatched = config.unitPatterns.some((pattern) =>
        new RegExp(pattern, 'i').test(fragment),
      );
      return mode === 'required' ? !unitMatched : unitMatched;
    });
    const passed = violatingFragments.length === 0;

    return {
      checkId: `${caseId}:task:homepage:${mode}_display_unit:${metric}`,
      severity: 'hard',
      passed,
      score: passed ? 1 : 0,
      maxScore: 1,
      message: passed
        ? `${metric} 的展示单位符合 ${mode} 合同`
        : `${metric} 的展示单位违反 ${mode} 合同`,
      details: passed
        ? undefined
        : {
            metric,
            metricPatterns: config.metricPatterns,
            unitPatterns: config.unitPatterns,
            violatingFragments,
          },
    };
  });
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

/** 检查事件窗口事实 */
function checkEventWindowFacts(
  caseId: string,
  text: string,
  patterns: string[],
): EvalCheckResult {
  if (patterns.length === 0) {
    return {
      checkId: `${caseId}:task:homepage:event_window_facts`,
      severity: 'hard',
      passed: false,
      score: 0,
      maxScore: 1,
      message: 'requireEventWindowFacts 为 true 但缺少 eventWindowValuePatterns',
      details: { reason: 'missing_event_window_value_patterns' },
    };
  }

  const matched = patterns.filter((pattern) => new RegExp(pattern).test(text));
  const passed = matched.length > 0;
  return {
    checkId: `${caseId}:task:homepage:event_window_facts`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed ? '命中事件窗口事实' : '未命中任何事件窗口事实',
    details: passed ? { matched } : { patterns },
  };
}

/** 检查 summary 开头不得以整日状态为主体 */
function checkDailyStatusNotFirst(
  caseId: string,
  summary: string,
  patterns: string[],
): EvalCheckResult {
  const summaryHead = summary.slice(0, 80);
  const matched = patterns.filter((pattern) => new RegExp(pattern).test(summaryHead));
  const passed = matched.length === 0;
  return {
    checkId: `${caseId}:task:homepage:daily_status_not_first`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed ? 'summary 开头没有以整日状态为主体' : 'summary 开头以整日状态为主体',
    details: passed ? undefined : { matched, summaryHead },
  };
}

/** 检查 summary 中不得出现指定 forbidden patterns */
function checkForbidSummaryPatterns(
  caseId: string,
  summary: string,
  patterns: string[],
): EvalCheckResult[] {
  return patterns.map((pattern) => {
    const regex = new RegExp(pattern, 'i');
    const matched = regex.test(summary);
    return {
      checkId: `${caseId}:task:homepage:forbid_summary_pattern:${pattern}`,
      severity: 'hard',
      passed: !matched,
      score: matched ? 0 : 1,
      maxScore: 1,
      message: matched
        ? `summary matched forbidden pattern: ${pattern}`
        : `summary did not match forbidden pattern: ${pattern}`,
      details: matched ? { pattern, summarySnippet: summary.slice(0, 200) } : undefined,
    };
  });
}

/** 检查 actions 中不得出现指定 forbidden patterns */
function checkForbidActionPatterns(
  caseId: string,
  actionText: string,
  patterns: string[],
): EvalCheckResult[] {
  return patterns.map((pattern) => {
    const regex = new RegExp(pattern, 'i');
    const matched = regex.test(actionText);
    return {
      checkId: `${caseId}:task:homepage:forbid_action_pattern:${pattern}`,
      severity: 'hard',
      passed: !matched,
      score: matched ? 0 : 1,
      maxScore: 1,
      message: matched
        ? `actions matched forbidden pattern: ${pattern}`
        : `actions did not match forbidden pattern: ${pattern}`,
      details: matched ? { pattern, actionTextSnippet: actionText.slice(0, 200) } : undefined,
    };
  });
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

// ── Task 4.2：客户边界通用检查 ──────────────────────────

/**
 * 内部派生评分的通用黑名单。
 * 不硬编码截图中的具体数字 (3.9/9.7/0.98)，
 * 而是检查"是否泄漏了任何内部评分指标"。
 *
 * 黑名单来自 Task 3.3 的 realtime-brief-content-policy 的 INTERNAL_SCORE_KEYWORDS，
 * 此处是独立副本以便测试单独运行。
 */
const DEFAULT_INTERNAL_SCORE_PATTERNS: ReadonlyArray<string> = [
  // 中文评分关键词
  '运动强度[^。；！？\\n]{0,8}\\d+(\\.\\d+)?',
  '动作强度[^。；！？\\n]{0,8}\\d+(\\.\\d+)?',
  '压力负荷[^。；！？\\n]{0,8}\\d+(\\.\\d+)?',
  '压力评分[^。；！？\\n]{0,8}\\d+(\\.\\d+)?',
  '压力指数[^。；！？\\n]{0,8}\\d+(\\.\\d+)?',
  '睡眠评分[^。；！？\\n]{0,8}\\d+',
  '睡眠分[^。；！？\\n]{0,8}\\d+',
  '质量评分[^。；！？\\n]{0,8}\\d+',
  '恢复评分[^。；！？\\n]{0,8}\\d+',
  '准备度[^。；！？\\n]{0,8}\\d+',
  // 英文评分关键词
  'motion\\s*intensity[^.;!?\\n]{0,8}\\d+(\\.\\d+)?',
  'stress\\s*load[^.;!?\\n]{0,8}\\d+(\\.\\d+)?',
  'sleep\\s*score[^.;!?\\n]{0,8}\\d+',
  'readiness\\s*score[^.;!?\\n]{0,8}\\d+',
  'quality\\s*score[^.;!?\\n]{0,8}\\d+',
];

/**
 * 系统能力披露的通用黑名单。
 * 检查"算法/模型无法测量"、"戒指不能检测"等元说明。
 */
const DEFAULT_CAPABILITY_PATTERNS: ReadonlyArray<string> = [
  // 中文中常见的元说明
  '没有.{0,4}(算法|模型|能力|机制)',
  '无法.{0,4}(测量|检测|识别|分析|监测|估算|估计)',
  '不具备.{0,4}(测量|检测|识别|分析|监测)',
  '不支持.{0,4}(测量|检测|识别|分析|监测)',
  '(戒指|手环|设备|传感器).{0,8}(无法|不能|不具备|不支持|没有)',
  '算法识别',
  '算法检测',
  '算法分析',
  '模型推理',
  '模型判断',
  '我们的算法',
  '系统识别',
  '机器学习',
  // 英文元说明
  'no\\s+algorithm\\s+to',
  'cannot\\s+(measure|detect|estimate|analyze)',
  'can\\s*not\\s+(measure|detect|estimate|analyze)',
  'ring\\s+(cannot|can\\s*not|is\\s+unable)',
  'unable\\s+to\\s+(measure|detect|estimate)',
  'do\\s+not\\s+have\\s+(access|capability)',
];

/**
 * Task 4.2：检查 summary 是否使用概率性措辞描述 sensor-inferred 事件。
 *
 * 三个子检查：
 * 1. summary 命中至少一个 probabilisticPatterns
 * 2. summary 不得命中任何 deterministicForbiddenPatterns
 * 3. (可选) summary 不得出现置信度百分比
 */
function checkRequireProbabilisticEventLanguage(
  caseId: string,
  summary: string,
  config: {
    probabilisticPatterns: string[];
    deterministicForbiddenPatterns: string[];
    forbidConfidencePercentage?: boolean;
  },
): EvalCheckResult[] {
  const results: EvalCheckResult[] = [];

  // 子检查 1：必须命中至少一个概率措辞
  const probabilisticHit = config.probabilisticPatterns.filter((p) => new RegExp(p, 'i').test(summary));
  const passedProbabilistic = probabilisticHit.length > 0;
  results.push({
    checkId: `${caseId}:task:homepage:probabilistic_language_required`,
    severity: 'hard',
    passed: passedProbabilistic,
    score: passedProbabilistic ? 1 : 0,
    maxScore: 1,
    message: passedProbabilistic
      ? 'summary 使用了概率性措辞描述 sensor-inferred 事件'
      : 'summary 未使用任何概率性措辞描述 sensor-inferred 事件',
    details: passedProbabilistic
      ? { matched: probabilisticHit }
      : { patterns: config.probabilisticPatterns, summaryHead: summary.slice(0, 200) },
  });

  // 子检查 2：不得命中确定性措辞
  const deterministicHits = config.deterministicForbiddenPatterns.filter((p) =>
    new RegExp(p, 'i').test(summary),
  );
  const passedDeterministic = deterministicHits.length === 0;
  results.push({
    checkId: `${caseId}:task:homepage:deterministic_language_forbidden`,
    severity: 'hard',
    passed: passedDeterministic,
    score: passedDeterministic ? 1 : 0,
    maxScore: 1,
    message: passedDeterministic
      ? 'summary 未出现 sensor-inferred 事件的确定性断言'
      : `summary 出现了确定性断言: ${deterministicHits.join(', ')}`,
    details: passedDeterministic
      ? undefined
      : { matched: deterministicHits, summaryHead: summary.slice(0, 200) },
  });

  // 子检查 3：(可选) 不得出现置信度百分比
  if (config.forbidConfidencePercentage) {
    // 匹配 "98%"、"98 %"、"confidence 80%"、"置信度 98%"、"98% 可能" 等
    const confidencePercentagePattern = /(\d+(\.\d+)?\s*%|(confidence|置信度)[^。；！？\n]{0,8}\d+)/i;
    const hasPercentage = confidencePercentagePattern.test(summary);
    results.push({
      checkId: `${caseId}:task:homepage:confidence_percentage_forbidden`,
      severity: 'hard',
      passed: !hasPercentage,
      score: hasPercentage ? 0 : 1,
      maxScore: 1,
      message: hasPercentage
        ? 'summary 出现了置信度百分比（禁止向客户展示）'
        : 'summary 未出现置信度百分比',
      details: hasPercentage ? { summaryHead: summary.slice(0, 200) } : undefined,
    });
  }

  return results;
}

/**
 * Task 4.2：检查客户文本是否披露内部派生评分。
 *
 * 使用通用黑名单（不硬编码截图数字），或使用 case 提供的 scorePatterns。
 */
function checkForbidInternalDerivedScores(
  caseId: string,
  text: string,
  scorePatterns?: string[],
): EvalCheckResult {
  const patterns = scorePatterns && scorePatterns.length > 0
    ? scorePatterns
    : Array.from(DEFAULT_INTERNAL_SCORE_PATTERNS);

  const matched = patterns.filter((p) => new RegExp(p, 'i').test(text));
  const passed = matched.length === 0;
  return {
    checkId: `${caseId}:task:homepage:internal_score_forbidden`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? '客户文本未披露内部派生评分'
      : `客户文本披露了内部派生评分: ${matched.join(', ')}`,
    details: passed ? undefined : { matched, textSnippet: text.slice(0, 200) },
  };
}

/**
 * Task 4.2：检查客户文本是否披露系统能力、算法机制或设备限制。
 *
 * 使用通用黑名单，或使用 case 提供的 capabilityPatterns。
 */
function checkForbidCapabilityDisclosure(
  caseId: string,
  text: string,
  capabilityPatterns?: string[],
): EvalCheckResult {
  const patterns = capabilityPatterns && capabilityPatterns.length > 0
    ? capabilityPatterns
    : Array.from(DEFAULT_CAPABILITY_PATTERNS);

  const matched = patterns.filter((p) => new RegExp(p, 'i').test(text));
  const passed = matched.length === 0;
  return {
    checkId: `${caseId}:task:homepage:capability_disclosure_forbidden`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? '客户文本未披露系统能力/算法机制'
      : `客户文本披露了系统能力/算法机制: ${matched.join(', ')}`,
    details: passed ? undefined : { matched, textSnippet: text.slice(0, 200) },
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
