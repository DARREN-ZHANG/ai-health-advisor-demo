import { z } from 'zod';

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
]);

/** 安全约束 */
export const SafetyConstraint = z.enum([
  'no_diagnosis', 'no_medication_advice', 'no_treatment_promise',
  'disclose_missing_data', 'recommend_doctor_when_critical',
]);

/** AnalysisPlan schema 定义 */
export const AnalysisPlanSchema = z.object({
  planId: z.string().min(1),
  taskType: z.literal('advisor_chat'),
  userIntent: z.object({
    action: ActionIntent,
    riskLevel: z.enum(['general', 'safety_boundary']),
    needsClarification: z.boolean(),
    clarificationQuestion: z.string().optional(),
  }),
  evidenceNeeds: z.array(z.object({
    metric: MetricType,
    timeScope: TimeScope,
    dateRange: z.object({ start: z.string(), end: z.string() }).optional(),
    reason: z.string().min(1),
    required: z.boolean(),
  })),
  safetyConstraints: z.array(SafetyConstraint),
  answerShape: z.object({
    includeMissingDataDisclosure: z.boolean(),
    includeChartTokens: z.boolean(),
    maxSummaryLength: z.number().int().positive(),
    tone: z.enum(['concise', 'explanatory']),
  }),
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
