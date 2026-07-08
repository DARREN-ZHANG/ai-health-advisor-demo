import type { ChartTokenId, DataTab, Timeframe } from '@health-advisor/shared';
import { z } from 'zod';
import { MetricType } from '../planner/analysis-plan';
import type { RecentRecommendedAction } from '../types/memory';

// ────────────────────────────────────────────
// 核心 Metric 类型
// ────────────────────────────────────────────

// H-5: 从统一的 MetricType 派生，保持与 planner/tools 层一致
export type MetricName = typeof MetricType extends z.ZodEnum<infer Values> ? Values[number] : never;

export interface MetricValue {
  value: number;
  unit: string;
  date?: string;
}

export interface MissingDataCoverage {
  missingCount: number;
  totalCount: number;
  completenessPct: number;
}

export interface MetricAnomalyPoint {
  date: string;
  value: number;
  expectedRange?: [number, number];
  description: string;
}

export interface MetricSummary {
  metric: MetricName;
  latest?: MetricValue;
  average?: MetricValue;
  min?: MetricValue;
  max?: MetricValue;
  baseline?: MetricValue;
  deltaPctVsBaseline?: number;
  trendDirection: 'up' | 'down' | 'stable' | 'unknown';
  anomalyPoints: MetricAnomalyPoint[];
  missing: MissingDataCoverage;
  evidenceIds: string[];
}

// ────────────────────────────────────────────
// Evidence
// ────────────────────────────────────────────

export type EvidenceSource =
  | 'daily_records'
  | 'timeline_sync'
  | 'profile'
  | 'rules'
  | 'memory'
  | 'knowledge_base';

export interface EvidenceFact {
  id: string;
  source: EvidenceSource;
  dateRange?: {
    start: string;
    end: string;
  };
  metric?: string;
  value?: number | string | boolean;
  unit?: string;
  derivation: string;
}

// ────────────────────────────────────────────
// Missing Data
// ────────────────────────────────────────────

export type MissingDataScope = 'latest24h' | 'selectedWindow' | 'trend7d' | 'visibleChart';

export interface MissingDataItem {
  metric: string;
  scope: MissingDataScope;
  missingCount: number;
  totalCount: number;
  lastAvailableDate?: string;
  impact: string;
  requiredDisclosure?: string;
  evidenceId: string;
}

// ────────────────────────────────────────────
// Visible Chart
// ────────────────────────────────────────────

export interface VisibleChartPacket {
  chartToken: ChartTokenId;
  metric: MetricName;
  timeframe: Timeframe;
  visible: boolean;
  dataSummary: MetricSummary;
  evidenceIds: string[];
}

// ────────────────────────────────────────────
// Task / User / DataWindow
// ────────────────────────────────────────────

export interface TaskPacket {
  type: string;
  page: string;
  tab?: DataTab;
  timeframe?: Timeframe;
  dateRange?: { start: string; end: string };
  userMessage?: string;
  smartPromptId?: string;
}

export interface UserContextPacket {
  profileId: string;
  name: string;
  age: number;
  tags: string[];
  baselines: {
    restingHR: number;
    hrv: number;
    spo2: number;
    avgSleepMinutes: number;
    avgSteps: number;
  };
}

export interface DataWindowPacket {
  start: string;
  end: string;
  recordCount: number;
  completenessPct: number;
}

// ────────────────────────────────────────────
// Homepage
// ────────────────────────────────────────────

export interface Latest24hMetric {
  metric: string;
  value?: number;
  unit: string;
  baseline?: number;
  deltaPctVsBaseline?: number;
  status: 'normal' | 'attention' | 'critical' | 'missing';
  /** 临床严重程度说明（如 SpO2 绝对阈值触发的分级描述） */
  clinicalNote?: string;
  evidenceId?: string;
}

export interface Latest24hPacket {
  date: string;
  metrics: Latest24hMetric[];
}

export type HomepageEventWindowMetricName =
  | 'heart_rate'
  | 'hrv_rmssd'
  | 'spo2'
  | 'motion'
  | 'steps'
  | 'stress_load';

export type HomepageEventWindowCoverage = 'complete' | 'partial' | 'missing';

export interface HomepageEventWindowMetric {
  metric: HomepageEventWindowMetricName;
  unit: string;
  sampleCount: number;
  startValue?: number;
  endValue?: number;
  latest?: number;
  min?: number;
  max?: number;
  average?: number;
  delta?: number;
  qualifier: 'low' | 'normal' | 'elevated' | 'compressed' | 'recovering' | 'volatile' | 'missing';
  interpretation: string;
  evidenceId: string;
}

export interface HomepageEventWindowSummary {
  source: 'synced_device_samples';
  coverage: HomepageEventWindowCoverage;
  recognizedEventId: string;
  sourceSegmentId?: string;
  start: string;
  end: string;
  durationMin: number;
  sampleCount: number;
  metrics: HomepageEventWindowMetric[];
  evidenceIds: string[];
}

export interface RecentEventPacket {
  recognizedEventId?: string;
  type: string;
  start: string;
  end: string;
  durationMin: number;
  confidence: number;
  sourceSegmentId?: string;
  recognitionEvidence: string[];
  eventWindow?: HomepageEventWindowSummary;
  syncState: {
    lastSyncedMeasuredAt: string | null;
    pendingEventCount: number;
    fromSyncedWindow: boolean;
  };
  evidenceIds: string[];
}

export interface RuleInsightPacket {
  category: string;
  severity: string;
  metric?: string;
  message: string;
}

export type HomepageSemanticEventType =
  | 'sleep_end'
  | 'meal'
  | 'work_focus'
  | 'work_sedentary'
  | 'rest_break'
  | 'cardio_workout'
  | 'hiit_workout'
  | 'possible_caffeine_intake'
  | 'possible_alcohol_intake'
  | 'stress_spike'
  | 'prepare_sleep'
  | 'unknown';

export type EventPhysiologyMetric =
  | 'heart_rate'
  | 'hrv'
  | 'spo2'
  | 'skin_temperature'
  | 'motion'
  | 'sleep'
  | 'stress'
  | 'activity';

export interface EventPhysiologySummary {
  metric: EventPhysiologyMetric;
  value?: number;
  unit?: string;
  qualifier: 'low' | 'normal' | 'elevated' | 'compressed' | 'volatile' | 'recovering' | 'missing';
  interpretation: string;
  evidenceId?: string;
}

export type RecoveryContextVisibility = 'material' | 'suppressed';

export type RecoveryContextReason =
  | 'primary_event_is_sleep_related'
  | 'primary_event_has_evening_sleep_risk'
  | 'metric_is_attention_or_critical'
  | 'metric_supports_current_event'
  | 'not_material_to_current_event';

export interface RecoveryContextSummary {
  source: 'latest24h' | 'trend7d' | 'profile';
  metric: string;
  relation: 'supports' | 'conflicts' | 'neutral' | 'missing';
  summary: string;
  visibility: RecoveryContextVisibility;
  reason: RecoveryContextReason;
  evidenceId?: string;
}

export interface EventBodyTension {
  level: 'positive' | 'watch' | 'high' | 'critical';
  summary: string;
  reason: string;
}

export interface RecommendedFocus {
  category:
    | 'movement_reset'
    | 'breathing_reset'
    | 'nutrition'
    | 'hydration'
    | 'training_adjustment'
    | 'sleep_protection'
    | 'posture'
    | 'data_quality'
    | 'medical_attention';
  action: string;
  durationMin?: number;
  timing?: string;
  rationale: string;
}

export type ActionInteraction =
  | {
      kind: 'calendar';
      calendar: {
        title: string;
        timingLabel: string;
        durationMinutes: number;
      };
    }
  | {
      kind: 'micro_event';
      microEvent: {
        type: string;
        durationMinutes?: number;
        params?: Record<string, number | string | boolean>;
      };
    };

export interface ActionIntentCandidate {
  id: string;
  emoji: string;
  title: string;
  description: string;
  aiPromise: string;
  productCapability: 'record_choice' | 'contextual_followup';
  interaction?: ActionInteraction;
}

export interface HomepageEventMentionPolicy {
  summary: 'allowed' | 'forbidden';
  actions: 'allowed' | 'forbidden';
  reason: string;
}

export interface ActionSuppression {
  category?: RecommendedFocus['category'];
  interactionMicroEventType?: string;
  textPattern?: string;
  reason: string;
}

export interface HomepageEventTransitionContext {
  currentEventId: string;
  priorEventId?: string;
  priorEventType?: HomepageSemanticEventType;
  relation:
    | 'post_sedentary_activation'
    | 'post_workout_recovery'
    | 'post_intake_sleep_risk'
    | 'same_category_repeat'
    | 'neutral';
  internalFinding: string;
  allowedUserFacingAngle: string;
  forbiddenMentions: string[];
  actionSuppressions: ActionSuppression[];
}

export interface HomepageEventInsight {
  eventId: string;
  eventType: HomepageSemanticEventType;
  priority: 'high' | 'medium' | 'low';
  timeRelation: string;
  headline: string;
  eventWindow?: HomepageEventWindowSummary;
  physiology: EventPhysiologySummary[];
  recoveryContext: RecoveryContextSummary[];
  tension: EventBodyTension;
  recommendedFocus: RecommendedFocus[];
  actionIntents: ActionIntentCandidate[];
  evidenceIds: string[];
  mentionPolicy: HomepageEventMentionPolicy;
  transitionContext?: HomepageEventTransitionContext;
}

export interface HomepageContextPacket {
  recentEvents: RecentEventPacket[];
  latest24h: Latest24hPacket;
  trend7d: MetricSummary[];
  rulesInsights: RuleInsightPacket[];
  suggestedChartTokens: ChartTokenId[];
  eventInsights: HomepageEventInsight[];
  previousRecommendedActions?: RecentRecommendedAction[];
  /**
   * 今日已发生活动（独立通道）。
   * 仅用于 futureSuggestions 推断当天剩余时间的预测，
   * 禁止用于 summary 或 actions（与 recentEvents 的"最近 2 个事件"通道完全隔离）。
   */
  todayOccurredActivities?: OccurredActivity[];
}

/**
 * 今日已发生活动条目（独立通道）。
 * 来自 recognizedEvents 中 end <= demoNow 的部分，
 * 用于 futureSuggestions 推断；禁止进入 summary/actions 上下文。
 */
export interface OccurredActivity {
  /** 活动类型（RecognizedEvent.type，如 sleep、meal_intake、caffeine_intake） */
  type: string;
  /** ISO 开始时间 */
  start: string;
  /** ISO 结束时间 */
  end: string;
  /** 持续分钟数 */
  durationMin: number;
}

// ────────────────────────────────────────────
// View Summary
// ────────────────────────────────────────────

export interface ViewSummaryContextPacket {
  tab: DataTab;
  timeframe: Timeframe;
  selectedMetric?: MetricSummary;
  overviewMetrics?: MetricSummary[];
  visibleCharts: VisibleChartPacket[];
  rulesInsights: RuleInsightPacket[];
  suggestedChartTokens: ChartTokenId[];
}

// ────────────────────────────────────────────
// Advisor Chat
// ────────────────────────────────────────────

export interface QuestionIntentPacket {
  metricFocus: string[];
  timeScope: 'today' | 'yesterday' | 'week' | 'month' | 'custom' | 'unknown';
  actionIntent:
    | 'explain_chart'
    | 'exercise_readiness'
    | 'status_summary'
    | 'ask_why'
    | 'compare_periods'
    | 'general';
  riskLevel: 'general' | 'potential_risk' | 'safety_boundary';
}

export interface CurrentPagePacket {
  page: string;
  tab?: DataTab;
  timeframe?: Timeframe;
  visibleChartTokens: ChartTokenId[];
  chartDataSummaries: string[];
}

export interface RelevantFactPacket {
  label: string;
  factType:
    | 'metric'
    | 'trend'
    | 'missing-data'
    | 'chart'
    | 'event'
    | 'memory'
    | 'knowledge'
    | 'product';
  summary: string;
  evidenceIds: string[];
}

export interface ConversationPacket {
  role: 'user' | 'assistant';
  text: string;
}

export interface AdvisorConstraintPacket {
  type:
    | 'must_cite_evidence'
    | 'must_disclose_missing'
    | 'must_not_hallucinate'
    | 'chart_token_only';
  description: string;
}

export interface AdvisorChatContextPacket {
  userMessage: string;
  questionIntent: QuestionIntentPacket;
  currentPage: CurrentPagePacket;
  relevantFacts: RelevantFactPacket[];
  recentConversation: ConversationPacket[];
  constraints: AdvisorConstraintPacket[];
}

// ────────────────────────────────────────────
// 顶层 Packet
// ────────────────────────────────────────────

export interface TaskContextPacket {
  task: TaskPacket;
  userContext: UserContextPacket;
  dataWindow: DataWindowPacket;
  missingData: MissingDataItem[];
  evidence: EvidenceFact[];
  visibleCharts: VisibleChartPacket[];
  homepage?: HomepageContextPacket;
  viewSummary?: ViewSummaryContextPacket;
  advisorChat?: AdvisorChatContextPacket;
}
