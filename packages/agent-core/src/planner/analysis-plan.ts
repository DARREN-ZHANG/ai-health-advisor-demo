import { z } from 'zod';
import { UiDirectiveSchema } from '@health-advisor/shared';

/** 指标类型 */
export const MetricType = z.enum([
  'hrv', 'sleep', 'activity', 'stress', 'spo2', 'resting-hr',
]);

/** 时间范围 */
export const TimeScope = z.enum([
  'today', 'yesterday', 'week', 'month', 'custom', 'unknown',
]);

/** 用户动作意图 */
export const ActionIntent = z.enum([
  'status_summary', 'explain_chart', 'ask_why',
  'exercise_readiness', 'compare_periods', 'general',
  // 控制首页 UI 副作用（无健康数据推理）
  'control_ui',
]);

/** 安全约束 */
export const SafetyConstraint = z.enum([
  'no_diagnosis', 'no_medication_advice', 'no_treatment_promise',
  'disclose_missing_data', 'recommend_doctor_when_critical',
]);

/** WebSearch topic 枚举 */
export const WebSearchTopic = z.enum(['general', 'news']);

/** WebSearch timeRange 枚举 */
export const WebSearchTimeRange = z.enum(['day', 'week', 'month', 'year']);

/** 单个 WebSearch 需求 schema */
export const WebSearchNeedSchema = z.object({
  query: z.string().min(3),
  reason: z.string().min(1),
  required: z.boolean(),
  topic: WebSearchTopic.optional(),
  timeRange: WebSearchTimeRange.optional(),
  includeDomains: z.array(z.string().min(1)).optional(),
  excludeDomains: z.array(z.string().min(1)).optional(),
});

/** AnalysisPlan schema 定义 */
export const AnalysisPlanSchema = z.object({
  planId: z.string().min(1),
  taskType: z.literal('advisor_chat'),
  userIntent: z.object({
    action: ActionIntent,
    riskLevel: z.enum(['general', 'potential_risk', 'safety_boundary']),
    needsClarification: z.boolean(),
    clarificationQuestion: z.string().nullable().optional(),
  }),
  evidenceNeeds: z.array(z.object({
    metric: MetricType,
    timeScope: TimeScope,
    dateRange: z.object({ start: z.string(), end: z.string() }).optional(),
    reason: z.string().min(1),
    required: z.boolean(),
  })),
  knowledgeNeeds: z.array(z.object({
    metrics: z.array(z.string()).optional(),
    intents: z.array(z.string()).optional(),
    riskLevel: z.enum(['general', 'potential_risk', 'safety_boundary']).optional(),
    limit: z.number().int().positive().max(10).optional(),
  })).optional(),
  productNeeds: z.array(z.object({
    metrics: z.array(z.string()).optional(),
    productAreas: z.array(z.string()).optional(),
    limit: z.number().int().positive().max(10).optional(),
  })).optional(),
  webSearchNeeds: z.array(WebSearchNeedSchema).optional(),
  safetyConstraints: z.array(SafetyConstraint),
  answerShape: z.object({
    includeMissingDataDisclosure: z.boolean(),
    includeChartTokens: z.boolean(),
    maxSummaryLength: z.number().int().positive(),
    tone: z.enum(['concise', 'explanatory']),
  }),
  /**
   * Planner verifier 通过的 UI 指令。
   * - 纯 UI 请求：userIntent.action === 'control_ui'，必填。
   * - 混合请求：保留实际 health action，可选附带一条指令。
   * - clarification 或 fallback 路径必须为 null/undefined。
   */
  clientAction: UiDirectiveSchema.nullable().optional(),
});

/** AnalysisPlan 推断类型 */
export type AnalysisPlan = z.infer<typeof AnalysisPlanSchema>;

/** Plan 校验结果 */
export interface PlanVerificationResult {
  valid: boolean;
  violations: Array<{
    rule: string;
    message: string;
    path: string;
  }>;
}

/** MetricType 枚举推断类型 */
export type MetricTypeEnum = z.infer<typeof MetricType>;
/** TimeScope 枚举推断类型 */
export type TimeScopeEnum = z.infer<typeof TimeScope>;
/** ActionIntent 枚举推断类型 */
export type ActionIntentEnum = z.infer<typeof ActionIntent>;
/** SafetyConstraint 枚举推断类型 */
export type SafetyConstraintEnum = z.infer<typeof SafetyConstraint>;
/** WebSearch need 推断类型 */
export type WebSearchNeed = z.infer<typeof WebSearchNeedSchema>;
/** WebSearch topic 枚举推断类型 */
export type WebSearchTopicEnum = z.infer<typeof WebSearchTopic>;
/** WebSearch timeRange 枚举推断类型 */
export type WebSearchTimeRangeEnum = z.infer<typeof WebSearchTimeRange>;
