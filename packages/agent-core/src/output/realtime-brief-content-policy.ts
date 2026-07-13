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

/** en summary 词数下限（含） */
const EN_MIN_WORDS = 90;
/** en summary 词数上限（含） */
const EN_MAX_WORDS = 180;
/** zh summary grapheme 下限（含）— 仅 homepage_summary 强制下限 */
const ZH_MIN_GRAPHEMES = 220;
/** zh summary grapheme 上限（含） */
const ZH_MAX_GRAPHEMES = 420;

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

  // 来源 1：facts 中的 numeric 值
  for (const fact of evidencePacket.facts) {
    if (fact.kind === 'numeric') {
      allowedNumbers.add(fact.value);
    }
    // qualitative facts 没有数值，跳过
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
      allowedNumbers.add(evt.eventWindow.durationMin);
      for (const m of evt.eventWindow.metrics) {
        if (m.value !== undefined) {
          allowedNumbers.add(m.value);
        }
      }
    }
  }

  return { allowedNumbers };
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
  const fullText = textParts.join('\n');

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
    violations.push(...checkNumericAttribution(fullText, ledger));
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
function checkNumericAttribution(
  text: string,
  ledger: ClaimLedger,
): RealtimeBriefBoundaryViolation[] {
  const violations: RealtimeBriefBoundaryViolation[] = [];

  // 带单位的数值正则：支持中英文单位
  const numericWithUnit = /(\d+(?:\.\d+)?)\s*(bpm|ms|%|steps|min|分钟|分|小时|步|公里|km|cal|大卡|千卡|次)/gi;
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = numericWithUnit.exec(text)) !== null) {
    const valueStr = match[1]!;
    const value = parseFloat(valueStr);
    if (Number.isNaN(value)) continue;
    if (seen.has(valueStr)) continue;
    seen.add(valueStr);
    // 不在 ledger 中 → 违规
    if (!isNumberAllowed(value, ledger)) {
      violations.push({ code: 'unattributed_numeric_claim', value: valueStr });
    }
  }

  return violations;
}

/** 判断数值是否被允许（精确匹配 + 容差：±1 处理四舍五入） */
function isNumberAllowed(value: number, ledger: ClaimLedger): boolean {
  if (ledger.allowedNumbers.has(value)) return true;
  // 容差：±1 步允许（避免 7.99 vs 8.0 之类的舍入误差）
  for (const allowed of ledger.allowedNumbers) {
    if (Math.abs(allowed - value) < 0.01) return true;
  }
  return false;
}

/**
 * 检查 summary 长度是否在 locale 对应范围内。
 *
 * - zh：以 grapheme 数计（code point 计），220-420
 * - en：以空格分割的 word 数计，90-180
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

  if (locale === 'en') {
    const words = summary.trim().split(/\s+/).filter(Boolean).length;
    if (words > EN_MAX_WORDS) {
      return [{ code: 'summary_length_out_of_range', actual: words }];
    }
    if (enforceLowerBound && words < EN_MIN_WORDS) {
      return [{ code: 'summary_length_out_of_range', actual: words }];
    }
    return [];
  }

  // zh：grapheme 数（用 Array.from 处理 surrogate pair）
  const graphemes = Array.from(summary).length;
  if (graphemes > ZH_MAX_GRAPHEMES) {
    return [{ code: 'summary_length_out_of_range', actual: graphemes }];
  }
  if (enforceLowerBound && graphemes < ZH_MIN_GRAPHEMES) {
    return [{ code: 'summary_length_out_of_range', actual: graphemes }];
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
            ? `- [summary_length_out_of_range] summary 长度 ${v.actual} 超出范围（${ZH_MIN_GRAPHEMES}-${ZH_MAX_GRAPHEMES} 字符）。`
            : `- [summary_length_out_of_range] summary length ${v.actual} out of range (${EN_MIN_WORDS}-${EN_MAX_WORDS} words).`,
        );
        break;
    }
  }

  return sections.join('\n');
}
