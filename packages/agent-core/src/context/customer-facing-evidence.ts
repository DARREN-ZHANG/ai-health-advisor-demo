import type { ChartTokenId, DataTab, Locale, Timeframe } from '@health-advisor/shared';
import type {
  TaskContextPacket,
  TaskPacket,
  UserContextPacket,
  DataWindowPacket,
  MissingDataItem,
  VisibleChartPacket,
  HomepageContextPacket,
  ViewSummaryContextPacket,
  AdvisorChatContextPacket,
  Latest24hMetric,
  Latest24hPacket,
  RuleInsightPacket,
  RecentEventPacket,
  HomepageEventInsight,
  HomepageSemanticEventType,
  EventCertaintyBand,
  EventPhysiologySummary,
  HomepageEventWindowMetric,
  HomepageEventWindowSummary,
  RecoveryContextSummary,
  EventBodyTension,
  RecommendedFocus,
  ActionIntentCandidate,
  HomepageEventMentionPolicy,
  HomepageEventTransitionContext,
  MetricSummary,
  OccurredActivity,
  QuestionIntentPacket,
  CurrentPagePacket,
  ConversationPacket,
  AdvisorConstraintPacket,
} from './context-packet';
import type { RecentRecommendedAction } from '../types/memory';
import {
  formatCustomerFacingMetric,
  type PublicMetricUnit,
} from './customer-facing-unit-policy';

export type { PublicMetricUnit } from './customer-facing-unit-policy';

// ────────────────────────────────────────────
// 公开类型定义：封闭单位集合 + 判别联合事实
// ────────────────────────────────────────────

/**
 * 公开指标单位的封闭集合。
 *
 * 设计意图：通过 TypeScript 字面量联合，在编译期阻止 `unit: 'score'` 被构造。
 * 任何试图将 motion intensity / stress load / sleep score / quality score
 * 作为数值暴露给 LLM 的代码都会因为类型不匹配而无法编译。
 */
export interface PublicMetricValue {
  value: number;
  unit: PublicMetricUnit;
  date?: string;
}

export interface PublicUserContextPacket {
  profileId: string;
  name: string;
  age: number;
  tags: string[];
  baselines: {
    restingHR: PublicMetricValue;
    hrv: PublicMetricValue;
    spo2: PublicMetricValue;
    avgSleep: PublicMetricValue;
    avgSteps: PublicMetricValue;
  };
}

/**
 * 投影后的 latest24h 指标 — unit 收紧为 PublicMetricUnit 封闭集合。
 *
 * 设计意图：原 Latest24hMetric.unit 为开放 string，存在 `unit: 'score'`
 * 被序列化到公开 packet 的风险。此类型将 unit 限定为 PublicMetricUnit，
 * score 类指标（无数值物理单位）以 undefined 表达，从类型层面消除泄漏。
 */
export interface PublicLatest24hMetric {
  metric: string;
  value?: number;
  /** 仅保留物理单位；score 类指标此处为 undefined */
  unit: PublicMetricUnit | undefined;
  status: 'normal' | 'attention' | 'critical' | 'missing';
  /** 临床严重程度说明（如 SpO2 绝对阈值触发的分级描述） */
  clinicalNote?: string;
  evidenceId?: string;
}

/** 投影后的 latest24h 包 — metrics 使用收紧后的 PublicLatest24hMetric */
export interface PublicLatest24hPacket {
  date: string;
  metrics: PublicLatest24hMetric[];
}

/** 数值事实：带有物理单位的客户可见指标 */
export interface PublicNumericFact {
  kind: 'numeric';
  metric: string;
  value: number;
  unit: PublicMetricUnit;
  interpretation: string;
  evidenceId: string;
}

/** 定性事实：无数值、仅分级的客户可见指标（用于 score 类指标） */
export interface PublicQualitativeFact {
  kind: 'qualitative';
  metric: string;
  qualifier: 'low' | 'normal' | 'elevated' | 'compressed' | 'recovering' | 'volatile';
  interpretation: string;
  evidenceId: string;
}

/** 公开事实判别联合 — renderer 通过 kind 收窄 */
export type PublicFact = PublicNumericFact | PublicQualitativeFact;

// ────────────────────────────────────────────
// 投影后的客户可见上下文结构
// ────────────────────────────────────────────

/** 投影后的事件窗口指标 — 移除 raw values 中的 score 数值 */
export interface PublicEventWindowMetric {
  metric: string;
  /** 仅保留物理单位；score 类指标此处为 undefined */
  unit: PublicMetricUnit | undefined;
  /** 物理指标的代表性数值（如 HR max、HRV latest、steps max）；score 类为 undefined */
  value: number | undefined;
  /** 数值角色标签（max/latest/average 等），用于 renderer 展示 */
  valueRole: 'max' | 'latest' | 'average' | undefined;
  qualifier: PublicQualitativeFact['qualifier'] | 'missing';
  interpretation: string;
  evidenceId: string;
}

/** 投影后的事件窗口 — 移除内部 ID */
export interface PublicEventWindowSummary {
  coverage: 'complete' | 'partial' | 'missing';
  start: string;
  end: string;
  durationMin: number;
  sampleCount: number;
  metrics: PublicEventWindowMetric[];
}

/** 投影后的生理特征 — 仅保留物理单位数值 */
export interface PublicEventPhysiologySummary {
  metric: string;
  /** 仅保留物理单位；score 类指标此处为 undefined */
  unit: PublicMetricUnit | undefined;
  value: number | undefined;
  qualifier: PublicQualitativeFact['qualifier'] | 'missing';
  interpretation: string;
}

/** 投影后的恢复背景 — 移除内部 reason/evidenceId 关联 */
export interface PublicRecoveryContextSummary {
  metric: string;
  relation: 'supports' | 'conflicts' | 'neutral' | 'missing';
  summary: string;
}

export interface PublicEventBodyTension {
  level: 'positive' | 'watch' | 'high' | 'critical';
  summary: string;
}

/**
 * 投影后的 transitionContext — 保留 LLM 推理所需的约束，移除内部 IDs。
 *
 * 保留：relation、allowedUserFacingAngle、forbiddenMentions、actionSuppressions
 * 移除：currentEventId、priorEventId、priorEventType（内部 ID）、internalFinding（内部措辞）
 */
export interface PublicHomepageEventTransitionContext {
  relation:
    | 'post_sedentary_activation'
    | 'post_workout_recovery'
    | 'post_intake_sleep_risk'
    | 'same_category_repeat'
    | 'neutral';
  allowedUserFacingAngle: string;
  forbiddenMentions: string[];
  actionSuppressions: Array<{
    category?: RecommendedFocus['category'];
    interactionMicroEventType?: string;
    textPattern?: string;
    reason: string;
  }>;
}

export interface PublicHomepageEventInsight {
  eventId: string;
  eventType: HomepageSemanticEventType;
  certaintyBand: EventCertaintyBand;
  priority: 'high' | 'medium' | 'low';
  timeRelation: string;
  headline: string;
  eventWindow?: PublicEventWindowSummary;
  physiology: PublicEventPhysiologySummary[];
  recoveryContext: PublicRecoveryContextSummary[];
  tension: PublicEventBodyTension;
  recommendedFocus: RecommendedFocus[];
  actionIntents: ActionIntentCandidate[];
  mentionPolicy: HomepageEventMentionPolicy;
  transitionContext?: PublicHomepageEventTransitionContext;
}

export interface PublicHomepageContextPacket {
  latest24h: PublicLatest24hPacket;
  trend7d: PublicMetricSummary[];
  rulesInsights: PublicRuleInsightPacket[];
  suggestedChartTokens: ChartTokenId[];
  eventInsights: PublicHomepageEventInsight[];
  previousRecommendedActions?: RecentRecommendedAction[];
  todayOccurredActivities?: OccurredActivity[];
}

export interface PublicRuleInsightPacket {
  category: string;
  severity: string;
  metric?: string;
  /** 由结构化字段生成，不透传可能包含内部评分的原始 message。 */
  message: string;
}

/** 投影后的 MetricSummary — score 类指标移除 latest/average/baseline 数值 */
export interface PublicMetricSummary {
  metric: string;
  latest?: PublicMetricValue;
  average?: PublicMetricValue;
  trendDirection: 'up' | 'down' | 'stable' | 'unknown';
  anomalyPoints: Array<{ date: string; description: string }>;
  missing: { missingCount: number; totalCount: number; completenessPct: number };
}

export interface PublicVisibleChartPacket {
  chartToken: ChartTokenId;
  metric: string;
  timeframe: Timeframe;
  visible: boolean;
  dataSummary: PublicMetricSummary;
}

export interface PublicViewSummaryContextPacket {
  tab: DataTab;
  timeframe: Timeframe;
  selectedMetric?: PublicMetricSummary;
  overviewMetrics?: PublicMetricSummary[];
  visibleCharts: PublicVisibleChartPacket[];
  rulesInsights: PublicRuleInsightPacket[];
  suggestedChartTokens: ChartTokenId[];
}

export interface PublicAdvisorChatContextPacket {
  userMessage: string;
  questionIntent: QuestionIntentPacket;
  currentPage: Omit<CurrentPagePacket, 'chartDataSummaries'>;
  relevantFacts: PublicReviewedRelevantFactPacket[];
  recentConversation: ConversationPacket[];
  constraints: AdvisorConstraintPacket[];
}

export interface PublicReviewedRelevantFactPacket {
  factType: 'knowledge' | 'product';
  summary: string;
  evidenceIds: string[];
}

/**
 * CustomerFacingEvidencePacket — 内部 TaskContextPacket 的客户可见投影。
 *
 * 类型契约：
 * 1. facts 中所有 numeric fact 的 unit 必须属于 PublicMetricUnit 封闭集合
 * 2. motion / stress_load / sleep score / quality score 不得出现 numeric value
 * 3. 任何 confidence、sourceSegmentId、recognizedEventId、raw event type、
 *    baseline delta（作为内部字段）、verifier 字段均不出现在此包中
 * 4. events 的 certaintyBand 是唯一的确定性表达通道
 */
export interface CustomerFacingEvidencePacket {
  task: TaskPacket;
  userContext: PublicUserContextPacket;
  dataWindow: DataWindowPacket;
  missingData: MissingDataItem[];
  /** 扁平化的客户可见事实列表（取代原始 EvidenceFact） */
  facts: PublicFact[];
  /** 投影后的客户可见事件列表（移除内部字段） */
  events: PublicHomepageEventInsight[];
  visibleCharts: PublicVisibleChartPacket[];
  homepage?: PublicHomepageContextPacket;
  viewSummary?: PublicViewSummaryContextPacket;
  advisorChat?: PublicAdvisorChatContextPacket;
}

// ────────────────────────────────────────────
// 内部 → 公开单位映射
// ────────────────────────────────────────────

/**
 * score 类指标集合：motion intensity、stress load、sleep score、quality score。
 * 这些指标的数值属于内部推导产物，禁止以 numeric value 形式进入公开包。
 */
const SCORE_METRICS = new Set([
  'motion',
  'stress_load',
  'stress',
  'sleep_score',
  'sleepScore',
  'quality_score',
  'qualityScore',
  'readiness_score',
  'readinessScore',
]);

function isScoreMetric(metric: string): boolean {
  return SCORE_METRICS.has(metric);
}

/**
 * 将一个内部 (value, unit, metric) 三元组投影为 PublicFact。
 *
 * - 物理单位指标 → PublicNumericFact（保留 value）
 * - score/未知单位 → PublicQualitativeFact（丢弃 value，仅保留 qualifier/interpretation）
 */
function projectMetricToFact(params: {
  metric: string;
  value: number | undefined;
  unit: string | undefined;
  qualifier: PublicQualitativeFact['qualifier'];
  interpretation: string;
  evidenceId: string;
  locale: Locale;
}): PublicFact {
  const { metric, value, unit, qualifier, interpretation, evidenceId, locale } = params;

  // score 类指标强制降级为 qualitative，无论 unit 是什么
  if (isScoreMetric(metric)) {
    return {
      kind: 'qualitative',
      metric,
      qualifier,
      interpretation,
      evidenceId,
    };
  }

  if (unit === undefined || value === undefined) {
    return {
      kind: 'qualitative',
      metric,
      qualifier,
      interpretation,
      evidenceId,
    };
  }

  const projected = formatCustomerFacingMetric(metric, value, unit, locale);

  return {
    kind: 'numeric',
    metric,
    value: projected.value,
    unit: projected.unit,
    interpretation,
    evidenceId,
  };
}

// ────────────────────────────────────────────
// 子投影函数
// ────────────────────────────────────────────

function projectEventWindowMetric(
  metric: HomepageEventWindowMetric,
  locale: Locale,
): PublicEventWindowMetric {
  const isScore = isScoreMetric(metric.metric);
  // score 类指标：移除 interpretation 中的数值，仅保留定性描述
  const interpretation = isScore
    ? stripNumbersFromInterpretation(metric.metric, metric.interpretation, metric.qualifier)
    : metric.interpretation;

  // 物理指标：提取代表性数值与角色
  let value: number | undefined;
  let valueRole: 'max' | 'latest' | 'average' | undefined;
  if (!isScore) {
    switch (metric.metric) {
      case 'heart_rate':
        value = metric.max ?? metric.latest;
        valueRole = 'max';
        break;
      case 'hrv_rmssd':
        value = metric.latest;
        valueRole = 'latest';
        break;
      case 'spo2':
        value = metric.min ?? metric.latest;
        valueRole = 'latest';
        break;
      case 'steps':
        value = metric.max;
        valueRole = 'max';
        break;
      default:
        value = metric.average ?? metric.latest;
        valueRole = metric.average !== undefined ? 'average' : 'latest';
    }
  }


  const projected =
    !isScore && value !== undefined
      ? formatCustomerFacingMetric(metric.metric, value, metric.unit, locale)
      : undefined;

  return {
    metric: metric.metric,
    unit: projected?.unit,
    value: projected?.value,
    valueRole,
    qualifier: metric.qualifier,
    interpretation,
    evidenceId: metric.evidenceId,
  };
}

/**
 * score 类指标的 interpretation 改写器。
 *
 * 内部 interpretation 常包含具体数值（如"运动强度均值 3.9"、"压力负荷峰值 85"），
 * 这些数值不得进入公开包。此处替换为基于 qualifier 的定性描述。
 */
function stripNumbersFromInterpretation(
  metric: string,
  _original: string,
  qualifier: PublicQualitativeFact['qualifier'] | 'missing',
): string {
  const qualifierLabel: Record<PublicQualitativeFact['qualifier'], string> = {
    low: '偏低',
    normal: '正常',
    elevated: '上升',
    compressed: '压缩',
    recovering: '恢复中',
    volatile: '波动',
  };
  const label = qualifier === 'missing' ? '缺失' : qualifierLabel[qualifier] ?? qualifier;
  return `${metric} ${label}`;
}

function projectEventWindow(
  window: HomepageEventWindowSummary | undefined,
  locale: Locale,
): PublicEventWindowSummary | undefined {
  if (!window) return undefined;
  return {
    coverage: window.coverage,
    start: window.start,
    end: window.end,
    durationMin: window.durationMin,
    sampleCount: window.sampleCount,
    metrics: window.metrics.map((metric) => projectEventWindowMetric(metric, locale)),
  };
}

function projectPhysiology(
  item: EventPhysiologySummary,
  locale: Locale,
): PublicEventPhysiologySummary {
  const isScore = isScoreMetric(item.metric);
  const projected =
    !isScore && item.value !== undefined
      ? formatCustomerFacingMetric(item.metric, item.value, item.unit ?? '', locale)
      : undefined;
  // score 类指标：清理 interpretation 中的数值
  const interpretation = isScore
    ? stripNumbersFromInterpretation(item.metric, item.interpretation, item.qualifier)
    : item.interpretation;

  return {
    metric: item.metric,
    unit: projected?.unit,
    value: projected?.value,
    qualifier: item.qualifier,
    interpretation,
  };
}

function projectRecoveryContext(item: RecoveryContextSummary): PublicRecoveryContextSummary {
  return {
    metric: item.metric,
    relation: item.relation,
    summary: item.summary,
  };
}

function projectTension(tension: EventBodyTension): PublicEventBodyTension {
  return {
    level: tension.level,
    summary: tension.summary,
  };
}

function projectTransitionContext(
  ctx: HomepageEventTransitionContext | undefined,
): PublicHomepageEventTransitionContext | undefined {
  if (!ctx) return undefined;
  // 移除内部 IDs：currentEventId、priorEventId、priorEventType、internalFinding
  // 保留 LLM 推理所需的约束：relation、allowedUserFacingAngle、forbiddenMentions、actionSuppressions
  return {
    relation: ctx.relation,
    allowedUserFacingAngle: ctx.allowedUserFacingAngle,
    forbiddenMentions: ctx.forbiddenMentions,
    actionSuppressions: ctx.actionSuppressions,
  };
}

function projectEventInsight(
  insight: HomepageEventInsight,
  locale: Locale,
): PublicHomepageEventInsight {
  return {
    eventId: insight.eventId,
    eventType: insight.eventType,
    certaintyBand: insight.certaintyBand,
    priority: insight.priority,
    timeRelation: insight.timeRelation,
    headline: insight.headline,
    eventWindow: projectEventWindow(insight.eventWindow, locale),
    physiology: insight.physiology.map((item) => projectPhysiology(item, locale)),
    recoveryContext: insight.recoveryContext.map(projectRecoveryContext),
    tension: projectTension(insight.tension),
    recommendedFocus: insight.recommendedFocus,
    actionIntents: insight.actionIntents,
    mentionPolicy: insight.mentionPolicy,
    transitionContext: projectTransitionContext(insight.transitionContext),
  };
}

function projectLatest24hMetric(
  metric: Latest24hMetric,
  locale: Locale,
): PublicLatest24hMetric {
  // score 类指标：移除 value/baseline/deltaPctVsBaseline，unit 置为 undefined
  if (isScoreMetric(metric.metric)) {
    return {
      metric: metric.metric,
      unit: undefined,
      status: metric.status,
      evidenceId: metric.evidenceId,
      clinicalNote: metric.clinicalNote,
    };
  }
  const projected =
    metric.value !== undefined
      ? formatCustomerFacingMetric(metric.metric, metric.value, metric.unit, locale)
      : undefined;

  // 物理单位指标：按 metric 语义转换，不透传上游 unit
  return {
    metric: metric.metric,
    value: projected?.value,
    unit: projected?.unit,
    status: metric.status,
    evidenceId: metric.evidenceId,
    clinicalNote: metric.clinicalNote,
  };
}

function projectLatest24h(packet: Latest24hPacket, locale: Locale): PublicLatest24hPacket {
  return {
    date: packet.date,
    metrics: packet.metrics.map((metric) => projectLatest24hMetric(metric, locale)),
  };
}

function projectMetricValue(
  metric: string,
  value: { value: number; unit: string; date?: string } | undefined,
  locale: Locale,
): PublicMetricValue | undefined {
  if (!value) return undefined;
  if (isScoreMetric(metric)) return undefined;
  const projected = formatCustomerFacingMetric(metric, value.value, value.unit, locale);
  return {
    value: projected.value,
    unit: projected.unit,
    date: value.date,
  };
}

function projectMetricSummary(ms: MetricSummary, locale: Locale): PublicMetricSummary {
  return {
    metric: ms.metric,
    latest: projectMetricValue(ms.metric, ms.latest, locale),
    average: projectMetricValue(ms.metric, ms.average, locale),
    trendDirection: ms.trendDirection,
    anomalyPoints: ms.anomalyPoints.map((a) => ({
      date: a.date,
      description: a.description,
    })),
    missing: ms.missing,
  };
}

function projectVisibleChart(chart: VisibleChartPacket, locale: Locale): PublicVisibleChartPacket {
  return {
    chartToken: chart.chartToken,
    metric: chart.metric,
    timeframe: chart.timeframe,
    visible: chart.visible,
    dataSummary: projectMetricSummary(chart.dataSummary, locale),
  };
}

function projectRuleInsight(insight: RuleInsightPacket, locale: Locale): PublicRuleInsightPacket {
  const subject = insight.metric ?? (locale === 'zh' ? '整体状态' : 'overall status');
  return {
    category: insight.category,
    severity: insight.severity,
    metric: insight.metric,
    message:
      locale === 'zh'
        ? `${subject}：${insight.category}（${insight.severity}）`
        : `${subject}: ${insight.category} (${insight.severity})`,
  };
}

function projectHomepage(homepage: HomepageContextPacket, locale: Locale): PublicHomepageContextPacket {
  return {
    latest24h: projectLatest24h(homepage.latest24h, locale),
    trend7d: homepage.trend7d.map((summary) => projectMetricSummary(summary, locale)),
    rulesInsights: homepage.rulesInsights.map((insight) => projectRuleInsight(insight, locale)),
    suggestedChartTokens: homepage.suggestedChartTokens,
    eventInsights: (homepage.eventInsights ?? []).map((insight) => projectEventInsight(insight, locale)),
    previousRecommendedActions: homepage.previousRecommendedActions,
    todayOccurredActivities: homepage.todayOccurredActivities,
  };
}

function projectViewSummary(vs: ViewSummaryContextPacket, locale: Locale): PublicViewSummaryContextPacket {
  return {
    tab: vs.tab,
    timeframe: vs.timeframe,
    selectedMetric: vs.selectedMetric ? projectMetricSummary(vs.selectedMetric, locale) : undefined,
    overviewMetrics: vs.overviewMetrics?.map((summary) => projectMetricSummary(summary, locale)),
    visibleCharts: vs.visibleCharts.map((chart) => projectVisibleChart(chart, locale)),
    rulesInsights: vs.rulesInsights.map((insight) => projectRuleInsight(insight, locale)),
    suggestedChartTokens: vs.suggestedChartTokens,
  };
}

function projectAdvisorChat(chat: AdvisorChatContextPacket): PublicAdvisorChatContextPacket {
  return {
    userMessage: chat.userMessage,
    questionIntent: chat.questionIntent,
    currentPage: {
      page: chat.currentPage.page,
      tab: chat.currentPage.tab,
      timeframe: chat.currentPage.timeframe,
      visibleChartTokens: [...chat.currentPage.visibleChartTokens],
    },
    relevantFacts: chat.relevantFacts
      .filter(
        (fact): fact is typeof fact & { factType: 'knowledge' | 'product' } =>
          fact.factType === 'knowledge' || fact.factType === 'product',
      )
      .map((fact) => ({
        factType: fact.factType,
        summary: fact.summary,
        evidenceIds: [...fact.evidenceIds],
      })),
    recentConversation: chat.recentConversation,
    constraints: chat.constraints,
  };
}

function projectUserContext(user: UserContextPacket, locale: Locale): PublicUserContextPacket {
  const { baselines } = user;
  return {
    profileId: user.profileId,
    name: user.name,
    age: user.age,
    tags: [...user.tags],
    baselines: {
      restingHR: formatCustomerFacingMetric('resting_hr', baselines.restingHR, 'bpm', locale),
      hrv: formatCustomerFacingMetric('hrv', baselines.hrv, 'ms', locale),
      spo2: formatCustomerFacingMetric('spo2', baselines.spo2, '%', locale),
      avgSleep: formatCustomerFacingMetric(
        'avg_sleep',
        baselines.avgSleepMinutes,
        'min',
        locale,
      ),
      avgSteps: formatCustomerFacingMetric('steps', baselines.avgSteps, 'steps', locale),
    },
  };
}

// ────────────────────────────────────────────
// 从各来源收集扁平 PublicFact 列表
// ────────────────────────────────────────────

/** 从 latest24h 指标收集公开事实（应用 mentionPolicy 过滤） */
function collectLatest24hFacts(packet: TaskContextPacket, locale: Locale): PublicFact[] {
  const facts: PublicFact[] = [];
  const homepage = packet.homepage;
  if (!homepage) return facts;

  const metrics = homepage.latest24h.metrics;
  // 当有 displayable event 时，只收集 material recovery metrics（与旧 renderer 过滤一致）
  const hasDisplayableEvent = (homepage.eventInsights ?? []).some(
    (i) => i.mentionPolicy?.summary === 'allowed',
  );
  const materialMetrics = new Set(
    (homepage.eventInsights ?? [])
      .flatMap((i) => (i.mentionPolicy?.summary === 'allowed' ? i.recoveryContext : []))
      .filter((ctx) => ctx.visibility === 'material')
      .map((ctx) => ctx.metric),
  );

  for (const m of metrics) {
    if (m.status === 'missing') continue;
    // 有 displayable event 时：跳过非 material 的 sleep 类指标
    if (
      hasDisplayableEvent &&
      ['sleep_total', 'sleep_deep', 'sleep_rem'].includes(m.metric) &&
      !materialMetrics.has(m.metric)
    ) {
      continue;
    }
    const qualifier = statusToQualifier(m.status);
    const interpretation = buildLatest24hInterpretation(m, locale);
    facts.push(
      projectMetricToFact({
        metric: m.metric,
        value: m.value,
        unit: m.unit,
        qualifier,
        interpretation,
        evidenceId: m.evidenceId ?? `latest24h_${m.metric}`,
        locale,
      }),
    );
  }
  return facts;
}

function statusToQualifier(status: Latest24hMetric['status']): PublicQualitativeFact['qualifier'] {
  switch (status) {
    case 'normal':
      return 'normal';
    case 'attention':
      return 'elevated';
    case 'critical':
      return 'volatile';
    case 'missing':
      return 'normal';
  }
}

function buildLatest24hInterpretation(
  m: Latest24hMetric,
  locale: Locale,
): string {
  return locale === 'zh'
    ? `${m.metric} 状态：${m.status}`
    : `${m.metric} status: ${m.status}`;
}

/** 从事件窗口收集公开事实（同时扫描 recentEvents 和 eventInsights 的 eventWindow） */
function collectEventWindowFacts(packet: TaskContextPacket, locale: Locale): PublicFact[] {
  const facts: PublicFact[] = [];
  const seenEvidenceIds = new Set<string>();

  // 收集所有 eventWindow 来源：recentEvents + eventInsights
  const windows: HomepageEventWindowMetric[][] = [];
  for (const evt of packet.homepage?.recentEvents ?? []) {
    if (evt.eventWindow) windows.push(evt.eventWindow.metrics);
  }
  for (const evt of packet.homepage?.eventInsights ?? []) {
    if (evt.eventWindow) windows.push(evt.eventWindow.metrics);
  }

  for (const metrics of windows) {
    for (const m of metrics) {
      // 去重：同一 evidenceId 只投影一次
      if (seenEvidenceIds.has(m.evidenceId)) continue;
      seenEvidenceIds.add(m.evidenceId);

      const isScore = isScoreMetric(m.metric);
      const qualifier = m.qualifier === 'missing' ? 'normal' : m.qualifier;
      // score 类指标：清理 interpretation 中的数值
      const interpretation = isScore
        ? stripNumbersFromInterpretation(m.metric, m.interpretation, qualifier)
        : m.interpretation;
      facts.push(
        projectMetricToFact({
          metric: m.metric,
          value: pickEventWindowValue(m),
          unit: m.unit,
          qualifier,
          interpretation,
          evidenceId: m.evidenceId,
          locale,
        }),
      );
    }
  }
  return facts;
}

/** 事件窗口指标选取公开值：score 类指标返回 undefined */
function pickEventWindowValue(m: HomepageEventWindowMetric): number | undefined {
  if (isScoreMetric(m.metric)) return undefined;
  switch (m.metric) {
    case 'heart_rate':
      return m.max ?? m.latest;
    case 'hrv_rmssd':
      return m.latest;
    case 'spo2':
      return m.min ?? m.latest;
    case 'steps':
      return m.max;
    default:
      return m.average ?? m.latest;
  }
}

/** 从 view summary 收集公开事实 */
function collectViewSummaryFacts(packet: TaskContextPacket, locale: Locale): PublicFact[] {
  const facts: PublicFact[] = [];
  const vs = packet.viewSummary;
  if (!vs) return facts;

  const collectFromSummary = (ms: MetricSummary) => {
    const isScore = isScoreMetric(ms.metric);
    if (isScore) {
      facts.push({
        kind: 'qualitative',
        metric: ms.metric,
        qualifier: 'normal',
        interpretation: `${ms.metric} trend ${ms.trendDirection}`,
        evidenceId: ms.evidenceIds[0] ?? `view_${ms.metric}`,
      });
      return;
    }
    const latest = projectMetricValue(ms.metric, ms.latest, locale);
    const average = projectMetricValue(ms.metric, ms.average, locale);
    if (latest) {
      facts.push({
        kind: 'numeric',
        metric: ms.metric,
        value: latest.value,
        unit: latest.unit,
        interpretation: `latest ${ms.trendDirection}`,
        evidenceId: ms.evidenceIds[0] ?? `view_${ms.metric}`,
      });
    } else if (average) {
      facts.push({
        kind: 'numeric',
        metric: ms.metric,
        value: average.value,
        unit: average.unit,
        interpretation: `average ${ms.trendDirection}`,
        evidenceId: ms.evidenceIds[0] ?? `view_${ms.metric}`,
      });
    }
  };

  if (vs.selectedMetric) collectFromSummary(vs.selectedMetric);
  for (const m of vs.overviewMetrics ?? []) collectFromSummary(m);
  return facts;
}

/** 从 trend7d 收集公开事实（仅物理指标 latest） */
function collectTrend7dFacts(packet: TaskContextPacket, locale: Locale): PublicFact[] {
  const facts: PublicFact[] = [];
  const trends = packet.homepage?.trend7d ?? [];
  for (const ms of trends) {
    if (isScoreMetric(ms.metric)) continue;
    const latest = projectMetricValue(ms.metric, ms.latest, locale);
    if (latest) {
      facts.push({
        kind: 'numeric',
        metric: ms.metric,
        value: latest.value,
        unit: latest.unit,
        interpretation: `trend ${ms.trendDirection}`,
        evidenceId: ms.evidenceIds[0] ?? `trend_${ms.metric}`,
      });
    }
  }
  return facts;
}

/** Advisor chat 的自由文本 relevantFacts 不进入公开包；只重建可追溯的结构化 evidence。 */
function collectAdvisorChatFacts(packet: TaskContextPacket, locale: Locale): PublicFact[] {
  const chat = packet.advisorChat;
  if (!chat) return [];

  const requestedEvidenceIds = new Set(chat.relevantFacts.flatMap((fact) => fact.evidenceIds));
  const facts: PublicFact[] = [];

  for (const evidence of packet.evidence) {
    if (!requestedEvidenceIds.has(evidence.id)) continue;
    if (!evidence.metric || typeof evidence.value !== 'number') continue;

    facts.push(
      projectMetricToFact({
        metric: evidence.metric,
        value: evidence.value,
        unit: evidence.unit,
        qualifier: 'normal',
        interpretation:
          locale === 'zh'
            ? `${evidence.metric} 的可追溯事实`
            : `traceable ${evidence.metric} fact`,
        evidenceId: evidence.id,
        locale,
      }),
    );
  }

  return facts;
}

// ────────────────────────────────────────────
// 主投影入口
// ────────────────────────────────────────────

/**
 * 将内部 TaskContextPacket 投影为客户可见的 CustomerFacingEvidencePacket。
 *
 * 不变性：
 * 1. 纯函数 — 不修改输入
 * 2. 所有 numeric fact 的 unit 属于 PublicMetricUnit 封闭集合
 * 3. motion / stress_load / sleep score / quality score 不携带 numeric value
 * 4. confidence、sourceSegmentId、recognizedEventId、raw event type 被完全移除
 *
 * @param packet 内部上下文包
 * @param locale 用于生成客户可见 interpretation 文案
 */
export function buildCustomerFacingEvidencePacket(
  packet: TaskContextPacket,
  locale: Locale = 'zh',
): CustomerFacingEvidencePacket {
  const facts: PublicFact[] = [
    ...collectLatest24hFacts(packet, locale),
    ...collectEventWindowFacts(packet, locale),
    ...collectTrend7dFacts(packet, locale),
    ...collectViewSummaryFacts(packet, locale),
    ...collectAdvisorChatFacts(packet, locale),
  ];

  // 投影事件洞察为公开版本（移除内部字段）
  const events = (packet.homepage?.eventInsights ?? []).map((insight) =>
    projectEventInsight(insight, locale),
  );

  return {
    task: packet.task,
    userContext: projectUserContext(packet.userContext, locale),
    dataWindow: packet.dataWindow,
    missingData: packet.missingData,
    facts,
    events,
    visibleCharts: packet.visibleCharts.map((chart) => projectVisibleChart(chart, locale)),
    homepage: packet.homepage ? projectHomepage(packet.homepage, locale) : undefined,
    viewSummary: packet.viewSummary ? projectViewSummary(packet.viewSummary, locale) : undefined,
    advisorChat: packet.advisorChat ? projectAdvisorChat(packet.advisorChat) : undefined,
  };
}
