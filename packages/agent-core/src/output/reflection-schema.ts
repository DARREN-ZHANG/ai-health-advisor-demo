import { z } from 'zod';
import type { AgentResponseEnvelope } from '@health-advisor/shared';
import type { VerificationReport } from './verification-report';
import type { AnalysisPlan } from '../planner/analysis-plan';

/** Sync reflection 审核输入 */
export interface ReflectionReviewInput {
  envelope: AgentResponseEnvelope;
  verificationReport: VerificationReport;
  plan?: AnalysisPlan;
  collectedEvidence?: unknown[];
}

/** Sync reflection 审核结果中的违规项 */
export interface ReflectionViolation {
  category: 'safety' | 'accuracy' | 'completeness';
  severity: 'high' | 'medium';
  description: string;
  requiredChanges: string;
}

/** Sync reflection 审核结果 */
export interface ReflectionReviewResult {
  approved: boolean;
  violations: ReflectionViolation[];
}

/** Sync reflection 审核结果 Zod schema（用于解析 LLM 输出） */
export const ReflectionReviewResultSchema = z.object({
  approved: z.boolean(),
  violations: z.array(z.object({
    category: z.enum(['safety', 'accuracy', 'completeness']),
    severity: z.enum(['high', 'medium']),
    description: z.string(),
    requiredChanges: z.string(),
  })),
});
