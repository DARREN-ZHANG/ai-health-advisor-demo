/**
 * Task 3.3: Realtime Brief Content Policy
 *
 * 在 publish 前对 LLM 输出执行阻断式客户内容策略检查。
 * 任何违反概率措辞、评分隔离、系统元说明、数值归因或长度边界的输出
 * 都不会被写入 memory/cache 或返回客户。本模块是 fail-closed 的：不进行
 * 任何字符串清洗/替换，违规即拒绝。
 *
 * 依赖：
 * - CustomerFacingEvidencePacket (Task 3.1) — 公开事实的唯一权威来源
 * - Action candidates — 公开 action duration 数值的来源
 */
import type { Locale } from '@health-advisor/shared';
import type { ActionOption } from '@health-advisor/shared';
import type { AgentResponseEnvelope } from '@health-advisor/shared';
import type {
  CustomerFacingEvidencePacket,
  PublicFact,
  PublicHomepageEventInsight,
} from '../context/customer-facing-evidence';
import {
  formatCustomerFacingMetric,
  type PublicMetricUnit,
} from '../context/customer-facing-unit-policy';
// Task 4.1：长度策略与计数器的唯一来源
import {
  HOMEPAGE_SUMMARY_LENGTH,
  countHomepageSummaryLength,
  normalizeHomepageLocale,
} from '../policies/homepage-length-policy';

// ──────────────────────────────────────────────────
// 违规类型：封闭判别联合
// ──────────────────────────────────────────────────

/**
 * 客户边界违规的五种封闭类型。
 *
 * 1. inferred_event_asserted_as_fact — 对 sensor-inferred 事件使用确定性措辞
 * 2. internal_score_disclosed — 披露 motion intensity / stress load 等内部评分
 * 3. internal_capability_disclosed — 披露系统/算法能力
 * 4. unattributed_numeric_claim — 数值未匹配到公开 claim ledger
 * 5. summary_length_out_of_range — summary 长度越界
 */
export type RealtimeBriefBoundaryViolation =
  | { code: 'inferred_event_asserted_as_fact'; eventType: string }
  | { code: 'internal_score_disclosed'; metric: string }
  | { code: 'internal_capability_disclosed' }
  | { code: 'unattributed_numeric_claim'; value: string }
  | { code: 'summary_length_out_of_range'; actual: number };

// ──────────────────────────────────────────────────
// 长度策略常量
// ──────────────────────────────────────────────────
// Task 4.1：常量与计数器已迁移至唯一策略模块 homepage-length-policy.ts
// 本文件不得再维护本地长度常量，避免与 prompt / verifier / scorer 漂移。
// 长度边界通过 HOMEPAGE_SUMMARY_LENGTH 引用，计数通过 countHomepageSummaryLength 引用。

// ──────────────────────────────────────────────────
// 内部评分指标黑名单（与 customer-facing-evidence 的 SCORE_METRICS 对齐）
// ──────────────────────────────────────────────────

const INTERNAL_SCORE_KEYWORDS: ReadonlyArray<{ metric: string; patterns: RegExp[] }> = [
  {
    metric: 'motion_intensity',
    patterns: [
      /运动强度[^。；！？\n]{0,8}\d+(\.\d+)?/,
      /motion\s*intensity[^.;!?\n]{0,8}\d+(\.\d+)?/i,
      /动作强度[^。；！？\n]{0,8}\d+(\.\d+)?/,
    ],
  },
  {
    metric: 'stress_load',
    patterns: [
      /压力负荷[^。；！？\n]{0,8}\d+(\.\d+)?/,
      /压力评分[^。；！？\n]{0,8}\d+(\.\d+)?/,
      /压力指数[^。；！？\n]{0,8}\d+(\.\d+)?/,
      /stress\s*load[^.;!?\n]{0,8}\d+(\.\d+)?/i,
    ],
  },
  {
    metric: 'sleep_score',
    patterns: [
      /睡眠评分[^。；！？\n]{0,8}\d+/,
      /睡眠分[^。；！？\n]{0,8}\d+/,
      /sleep\s*score[^.;!?\n]{0,8}\d+/i,
    ],
  },
  {
    metric: 'quality_score',
    patterns: [
      /质量评分[^。；！？\n]{0,8}\d+/,
      /恢复评分[^。；！？\n]{0,8}\d+/,
      /readiness\s*score[^.;!?\n]{0,8}\d+/i,
      /准备度[^。；！？\n]{0,8}\d+/,
    ],
  },
];

// ──────────────────────────────────────────────────
// 系统能力披露黑名单
// ──────────────────────────────────────────────────

const CAPABILITY_DISCLOSURE_PATTERNS: RegExp[] = [
  // 系统能力否定
  /没有.{0,4}(算法|模型|能力|机制)/,
  /无法.{0,4}(测量|检测|识别|分析|监测)/,
  /不具备.{0,4}(测量|检测|识别|分析|监测)/,
  /不支持.{0,4}(测量|检测|识别|分析|监测)/,
  // 戒指/设备能力披露
  /(戒指|手环|设备|传感器).{0,8}(无法|不能|不具备|不支持|没有)/,
  // 算法/模型内部机制披露
  /算法识别/,
  /算法检测/,
  /算法分析/,
  /模型推理/,
  /模型判断/,
  /我们的算法/,
  /系统识别/,
  /机器学习/,
];

// ──────────────────────────────────────────────────
// 事件确定性档位 → 措辞检查
// ──────────────────────────────────────────────────

/** 中文确定性动词/结构：第二人称 + 完成体 */
const DETERMINISTIC_VERB_PATTERNS_ZH: RegExp[] = [
  /你(刚|已经|今天|这|最近)?(吃完|吃完饭|吃|喝完|喝|完成|做完|结束|开始|进行|经历|有(了|过)?)/,
  /你.{0,4}(完成|做完|结束|进行)了/,
  /你.{0,4}摄入了/,
];

/** 中文概率措辞白名单：包含这些词的句子视为概率性 */
const PROBABILISTIC_CUE_PATTERNS_ZH: RegExp[] = [
  /可能/,
  /大概率/,
  /似乎/,
  /像是/,
  /看起来/,
  /也许/,
  /或许/,
  /推测/,
  /迹象/,
  /估计/,
];

/** 英文确定性动词 */
const DETERMINISTIC_VERB_PATTERNS_EN: RegExp[] = [
  /\byou\s+(just|already|recently|today)?\s*(ate|finished|completed|started|had|consumed|did|went)\b/i,
];

/** 英文概率措辞白名单 */
const PROBABILISTIC_CUE_PATTERNS_EN: RegExp[] = [
  /\b(may|might|likely|possibly|seems|appears|probably|could be)\b/i,
];

// ──────────────────────────────────────────────────
// Claim Ledger
// ──────────────────────────────────────────────────

/**
 * 允许出现在客户输出中的数值集合。
 * 数据源：
 * 1. CustomerFacingEvidencePacket.facts（kind=numeric）— 公开事实的权威数值
 * 2. action candidates — description/aiPromise 中的分钟数等
 *
 * 设计意图：summary/actions/futureSuggestions 中出现的每个数值都必须能在
 * ledger 中找到匹配，否则判定为 unattributed_numeric_claim。
 */
export interface ClaimLedger {
  /** 允许的数值集合（含来自 facts 和 action 文本的数字） */
  readonly allowedNumbers: ReadonlySet<number>;
  /** 允许的物理量；数值与单位必须同时匹配。 */
  readonly allowedClaims: ReadonlyArray<{ value: number; unit: PublicMetricUnit }>;
}

/**
 * 构建 Claim Ledger。
 * 纯函数，不修改输入。
 */
export function buildClaimLedger(
  evidencePacket: CustomerFacingEvidencePacket,
  actionCandidates: ActionOption[],
): ClaimLedger {
  const allowedNumbers = new Set<number>();
  const allowedClaims: Array<{ value: number; unit: PublicMetricUnit }> = [];

  const addClaim = (value: number, unit: PublicMetricUnit): void => {
    allowedNumbers.add(value);
    if (!allowedClaims.some((claim) => claim.value === value && claim.unit === unit)) {
      allowedClaims.push({ value, unit });
    }
  };

  // 来源 1：facts 中的 numeric 值
  for (const fact of evidencePacket.facts) {
    if (fact.kind === 'numeric') {
      addClaim(fact.value, fact.unit);
    }
    // qualitative facts 没有数值，跳过
  }

  const baselines = evidencePacket.userContext.baselines;
  for (const baseline of [
    baselines.restingHR,
    baselines.hrv,
    baselines.spo2,
    baselines.avgSleep,
    baselines.avgSteps,
  ]) {
    addClaim(baseline.value, baseline.unit);
  }

  // 来源 2：action candidates 文本中的数字（duration 等）
  for (const action of actionCandidates) {
    collectNumbersFromText(action.description, allowedNumbers);
    collectNumbersFromText(action.aiPromise, allowedNumbers);
    if (action.interaction?.kind === 'calendar') {
      allowedNumbers.add(action.interaction.calendar.durationMinutes);
    }
    if (action.interaction?.kind === 'micro_event' && action.interaction.microEvent.durationMinutes) {
      allowedNumbers.add(action.interaction.microEvent.durationMinutes);
    }
  }

  // 来源 3：events 中 eventWindow/physiology 的公开数值（物理指标）
  for (const evt of evidencePacket.events) {
    if (evt.eventWindow) {
      const duration = formatCustomerFacingMetric(
        'event_duration',
        evt.eventWindow.durationMin,
        'min',
        'en',
      );
      addClaim(duration.value, duration.unit);
      for (const m of evt.eventWindow.metrics) {
        if (m.value !== undefined && m.unit) {
          addClaim(m.value, m.unit);
        }
      }
    }
    for (const item of evt.physiology) {
      if (item.value !== undefined && item.unit) addClaim(item.value, item.unit);
    }
  }

  return { allowedNumbers, allowedClaims };
}

/** 从文本中抽取整数（含小数），写入目标集合 */
function collectNumbersFromText(text: string, target: Set<number>): void {
  const numberPattern = /\d+(\.\d+)?/g;
  let match: RegExpExecArray | null;
  while ((match = numberPattern.exec(text)) !== null) {
    const value = parseFloat(match[0]);
    if (!Number.isNaN(value)) {
      target.add(value);
    }
  }
}

// ──────────────────────────────────────────────────
// Policy 入口
// ──────────────────────────────────────────────────

export interface RealtimeBriefPolicyInput {
  envelope: AgentResponseEnvelope;
  evidencePacket: CustomerFacingEvidencePacket;
  /** Action candidates（用于 claim ledger 构建） */
  actionCandidates: ActionOption[];
  /** 语言：决定长度策略 */
  locale: Locale;
  /**
   * 任务类型。长度下限仅对 homepage_summary 任务强制；
   * 其他任务（view_summary / advisor_chat）只检查上限。
   */
  taskType?: string;
}

export interface RealtimeBriefPolicyResult {
  /** true = 全部通过；false = 至少一个 violation */
  approved: boolean;
  /** 检测到的违规列表（可能为空） */
  violations: RealtimeBriefBoundaryViolation[];
}

/**
 * 执行客户内容策略。
 * 纯函数：不修改输入，不进行任何清洗/替换。
 * 检测到任何 violation → approved=false，调用方必须 fail-closed。
 */
export function enforceCustomerContentPolicy(
  input: RealtimeBriefPolicyInput,
): RealtimeBriefPolicyResult {
  const { envelope, evidencePacket, actionCandidates, locale, taskType } = input;

  const ledger = buildClaimLedger(evidencePacket, actionCandidates);
  const events = evidencePacket.events;

  // 收集所有需要扫描的客户可见文本
  const textParts: string[] = [envelope.summary];
  if (envelope.microTips) {
    textParts.push(...envelope.microTips);
  }
  if (envelope.actions) {
    for (const a of envelope.actions) {
      textParts.push(a.title, a.description, a.aiPromise);
    }
  }
  if (envelope.futureSuggestions) {
    for (const s of envelope.futureSuggestions) {
      textParts.push(s.predictedState, s.rationale, s.action.title, s.action.description, s.action.aiPromise);
    }
  }
  if (envelope.planDraftPreview) {
    textParts.push(envelope.planDraftPreview.title, envelope.planDraftPreview.summary);
    for (const group of envelope.planDraftPreview.groups) {
      textParts.push(group.title);
      for (const task of group.tasks) {
        textParts.push(task.title);
        if (task.description) textParts.push(task.description);
        if (task.suggestedTimeOfDay) textParts.push(task.suggestedTimeOfDay);
      }
    }
  }
  const fullText = textParts.join('\n');

  // 数值归因按字段语义检查。ActionOption 中的时长是用户可执行的处方参数，
  // 不是对既有健康事实的断言；其余物理指标仍必须能追溯到公开证据。
  const numericSegments: NumericAttributionSegment[] = [
    { text: envelope.summary, allowUnattributedActionDuration: false },
  ];
  if (envelope.actions) {
    for (const action of envelope.actions) {
      numericSegments.push({
        text: [action.title, action.description, action.aiPromise].join('\n'),
        allowUnattributedActionDuration: true,
      });
    }
  }
  if (envelope.futureSuggestions) {
    for (const suggestion of envelope.futureSuggestions) {
      numericSegments.push(
        {
          text: [suggestion.predictedState, suggestion.rationale].join('\n'),
          allowUnattributedActionDuration: false,
        },
        {
          text: [
            suggestion.action.title,
            suggestion.action.description,
            suggestion.action.aiPromise,
          ].join('\n'),
          allowUnattributedActionDuration: true,
        },
      );
    }
  }

  const violations: RealtimeBriefBoundaryViolation[] = [];

  // 检查 1：inferred_event_asserted_as_fact
  violations.push(...checkInferredEventAssertion(envelope.summary, events, locale));

  // 检查 2：internal_score_disclosed
  violations.push(...checkInternalScoreDisclosure(fullText));

  // 检查 3：internal_capability_disclosed
  violations.push(...checkCapabilityDisclosure(fullText));

  // 检查 4：unattributed_numeric_claim
  // 仅在 homepage_summary 任务强制（其他任务的 facts 来源不完整，避免误报）
  if (taskType === 'homepage_summary') {
    violations.push(...checkNumericAttribution(numericSegments, ledger));
  }

  // 检查 5：summary_length_out_of_range（下限仅对 homepage_summary 强制）
  violations.push(...checkSummaryLength(envelope.summary, locale, taskType));

  return {
    approved: violations.length === 0,
    violations,
  };
}

// ──────────────────────────────────────────────────
// 检查器实现
// ──────────────────────────────────────────────────

/**
 * 检查 sensor-inferred 事件是否被断言为事实。
 *
 * 判定规则：
 * - 仅对 certaintyBand ∈ {possible, likely} 的事件触发
 * - summary 中出现该事件关联的确定性措辞
 * - 但若同时出现概率措辞 → 豁免
 */
function checkInferredEventAssertion(
  summary: string,
  events: PublicHomepageEventInsight[],
  locale: Locale,
): RealtimeBriefBoundaryViolation[] {
  const violations: RealtimeBriefBoundaryViolation[] = [];

  const deterministicPatterns =
    locale === 'en' ? DETERMINISTIC_VERB_PATTERNS_EN : DETERMINISTIC_VERB_PATTERNS_ZH;
  const probabilisticPatterns =
    locale === 'en' ? PROBABILISTIC_CUE_PATTERNS_EN : PROBABILISTIC_CUE_PATTERNS_ZH;

  // 若 summary 整体已经使用概率措辞，则豁免所有 inferred 事件
  const hasOverallProbabilisticCue = probabilisticPatterns.some((p) => p.test(summary));
  if (hasOverallProbabilisticCue) return violations;

  for (const evt of events) {
    // 仅检查 sensor-inferred 事件
    if (evt.certaintyBand === 'reported') continue;
    // certaintyBand === 'possible' | 'likely'
    // 检查 summary 是否同时出现该事件的关键词和确定性动词
    const eventKeywords = getEventKeywords(evt.eventType, locale);
    const mentionsEvent = eventKeywords.some((kw) => summary.includes(kw));
    if (!mentionsEvent) continue;
    const hasDeterministic = deterministicPatterns.some((p) => p.test(summary));
    if (hasDeterministic) {
      violations.push({
        code: 'inferred_event_asserted_as_fact',
        eventType: evt.eventType,
      });
    }
  }

  return violations;
}

/** 按事件类型和 locale 返回可能出现在文案中的关键词 */
function getEventKeywords(eventType: string, locale: Locale): string[] {
  if (locale === 'en') {
    const enMap: Record<string, string[]> = {
      meal: ['meal', 'ate', 'eating', 'food'],
      possible_caffeine_intake: ['caffeine', 'coffee'],
      possible_alcohol_intake: ['alcohol', 'drink'],
      cardio_workout: ['cardio', 'workout', 'run', 'running'],
      hiit_workout: ['hiit', 'workout'],
      sleep_end: ['sleep', 'woke', 'wake'],
      stress_spike: ['stress'],
    };
    return enMap[eventType] ?? [eventType];
  }
  const zhMap: Record<string, string[]> = {
    meal: ['饭', '餐', '吃'],
    possible_caffeine_intake: ['咖啡', '咖啡因'],
    possible_alcohol_intake: ['酒', '酒精'],
    cardio_workout: ['有氧', '跑步', '训练'],
    hiit_workout: ['高强度', '训练'],
    sleep_end: ['睡眠', '醒来'],
    stress_spike: ['压力'],
  };
  return zhMap[eventType] ?? [eventType];
}

/**
 * 检查内部评分是否被披露。
 */
function checkInternalScoreDisclosure(text: string): RealtimeBriefBoundaryViolation[] {
  const violations: RealtimeBriefBoundaryViolation[] = [];
  for (const { metric, patterns } of INTERNAL_SCORE_KEYWORDS) {
    if (patterns.some((p) => p.test(text))) {
      violations.push({ code: 'internal_score_disclosed', metric });
    }
  }
  return violations;
}

/**
 * 检查系统/算法能力披露。
 */
function checkCapabilityDisclosure(text: string): RealtimeBriefBoundaryViolation[] {
  const matched = CAPABILITY_DISCLOSURE_PATTERNS.some((p) => p.test(text));
  return matched ? [{ code: 'internal_capability_disclosed' }] : [];
}

/**
 * 检查数值归因：summary/actions/futureSuggestions 中出现的每个数值
 * 都必须能在 claim ledger 中找到匹配。
 *
 * 设计取舍：仅扫描带物理单位的数值（bpm/ms/%/steps/min/分钟/小时/步/分）
 * 避免误报枚举数字（如 list 序号、时间点 "22:00" 等通过单位过滤规避）。
 */
interface NumericAttributionSegment {
  text: string;
  allowUnattributedActionDuration: boolean;
}

const ACTION_DURATION_UNITS = new Set(['min', '分钟', '分', 'h', '小时']);

const UNIT_ALIASES: Readonly<Record<string, PublicMetricUnit>> = {
  bpm: 'bpm',
  ms: 'ms',
  '%': '%',
  steps: 'steps',
  步: 'steps',
  min: 'min',
  分钟: 'min',
  分: 'min',
  h: 'h',
  小时: 'h',
  km: 'km',
  公里: 'km',
  kcal: 'kcal',
  cal: 'kcal',
  大卡: 'kcal',
  千卡: 'kcal',
};

function checkNumericAttribution(
  segments: NumericAttributionSegment[],
  ledger: ClaimLedger,
): RealtimeBriefBoundaryViolation[] {
  const violations: RealtimeBriefBoundaryViolation[] = [];

  // 带单位的数值正则：支持中英文单位
  const numericWithUnit = /(\d+(?:\.\d+)?)\s*(bpm|ms|%|steps|min|分钟|分|h|小时|步|公里|km|kcal|cal|大卡|千卡)/gi;
  const seen = new Set<string>();

  for (const segment of segments) {
    numericWithUnit.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = numericWithUnit.exec(segment.text)) !== null) {
      const valueStr = match[1]!;
      const rawUnit = match[2]!.toLowerCase();
      const unit = UNIT_ALIASES[rawUnit];
      const value = parseFloat(valueStr);
      if (Number.isNaN(value) || !unit) continue;

      // 行动字段里的时间单位描述的是建议本身，不是健康测量结论。
      if (segment.allowUnattributedActionDuration && ACTION_DURATION_UNITS.has(rawUnit)) {
        continue;
      }

      if (seen.has(valueStr)) continue;
      seen.add(valueStr);
      // 不在 ledger 中 → 违规
      if (!isClaimAllowed(value, unit, ledger)) {
        violations.push({ code: 'unattributed_numeric_claim', value: valueStr });
      }
    }
  }

  return violations;
}

/**
 * 判断数值是否被允许（精确匹配 + 宽松容差）。
 *
 * 容差策略：绝对容差 1 或相对容差 5%，取较大值。
 * 允许模型对数值进行合理的四舍五入（如 54.8ms→55ms, 8123步→8000步），
 * 同时拒绝明显编造的数值（如 evidence 65bpm 时声称 120bpm）。
 */
function isClaimAllowed(
  value: number,
  unit: PublicMetricUnit,
  ledger: ClaimLedger,
): boolean {
  for (const allowed of ledger.allowedClaims) {
    if (allowed.unit !== unit) continue;
    const tolerance = Math.max(1, allowed.value * 0.05);
    if (Math.abs(allowed.value - value) <= tolerance) return true;
  }
  return false;
}

/**
 * 检查 summary 长度是否在 locale 对应范围内。
 *
 * Task 4.1：边界数字与计数器全部来自共享策略 homepage-length-policy。
 * - zh：以 Intl.Segmenter grapheme cluster 数计，220-420
 * - en：以 Intl.Segmenter isWordLike segment 数计，90-180
 *
 * 超长一律触发；下限仅在 homepage_summary 任务时严格按 spec 触发，
 * 其他任务（view_summary / advisor_chat）不强制下限，避免对短回复误报。
 */
function checkSummaryLength(
  summary: string,
  locale: Locale,
  taskType?: string,
): RealtimeBriefBoundaryViolation[] {
  const enforceLowerBound = taskType === 'homepage_summary';
  const normalizedLocale = normalizeHomepageLocale(locale);
  const config = HOMEPAGE_SUMMARY_LENGTH[normalizedLocale];
  const actual = countHomepageSummaryLength(summary, normalizedLocale);

  if (actual > config.max) {
    return [{ code: 'summary_length_out_of_range', actual }];
  }
  if (enforceLowerBound && actual < config.min) {
    return [{ code: 'summary_length_out_of_range', actual }];
  }
  return [];
}

// ──────────────────────────────────────────────────
// Regeneration Feedback 构造器
// ──────────────────────────────────────────────────

/**
 * 构造 regeneration 反馈。
 *
 * 关键约束：
 * - 只传结构化 violation code + 客户规则
 * - 不拼接任何内部数据值（如 confidence、raw score）
 * - 调用方据此重写 prompt 提示模型修正
 */
export function buildRegenerationFeedback(
  violations: RealtimeBriefBoundaryViolation[],
  locale: Locale,
): string {
  const sections: string[] = [];
  sections.push(
    locale === 'zh'
      ? '## 上次回复违反客户内容策略，请按以下违规类型修正：'
      : '## Previous response violated customer content policy. Fix the following:',
  );

  for (const v of violations) {
    switch (v.code) {
      case 'inferred_event_asserted_as_fact':
        sections.push(
          locale === 'zh'
            ? `- [inferred_event_asserted_as_fact] 事件 "${v.eventType}" 为传感器推断，必须使用概率性措辞（如"可能/大概率"）。`
            : `- [inferred_event_asserted_as_fact] Event "${v.eventType}" is sensor-inferred; use probabilistic language.`,
        );
        break;
      case 'internal_score_disclosed':
        sections.push(
          locale === 'zh'
            ? `- [internal_score_disclosed] 禁止披露内部评分（${v.metric}）。请改用定性描述。`
            : `- [internal_score_disclosed] Do not disclose internal score (${v.metric}). Use qualitative description.`,
        );
        break;
      case 'internal_capability_disclosed':
        sections.push(
          locale === 'zh'
            ? '- [internal_capability_disclosed] 禁止披露系统能力、算法机制或设备限制。'
            : '- [internal_capability_disclosed] Do not disclose system/algorithm capabilities or device limits.',
        );
        break;
      case 'unattributed_numeric_claim':
        sections.push(
          locale === 'zh'
            ? `- [unattributed_numeric_claim] 数值 ${v.value} 无法追溯到客户可见证据。仅可引用上下文提供的公开事实数值。`
            : `- [unattributed_numeric_claim] Numeric value ${v.value} not backed by public evidence. Only cite values from the provided context.`,
        );
        break;
      case 'summary_length_out_of_range':
        sections.push(
          locale === 'zh'
            ? `- [summary_length_out_of_range] summary 长度 ${v.actual} 超出范围（${HOMEPAGE_SUMMARY_LENGTH.zh.min}-${HOMEPAGE_SUMMARY_LENGTH.zh.max} 字符）。`
            : `- [summary_length_out_of_range] summary length ${v.actual} out of range (${HOMEPAGE_SUMMARY_LENGTH.en.min}-${HOMEPAGE_SUMMARY_LENGTH.en.max} words).`,
        );
        break;
    }
  }

  return sections.join('\n');
}
