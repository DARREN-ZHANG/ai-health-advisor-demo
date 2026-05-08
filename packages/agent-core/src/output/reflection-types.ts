import type { AgentResponseEnvelope } from '@health-advisor/shared';
import type { VerificationReport } from './verification-report';

/** Reviewer 发现的问题分类 */
export type IssueCategory = 'safety' | 'accuracy' | 'completeness' | 'clarity';

/** 问题严重程度 */
export type IssueSeverity = 'high' | 'medium' | 'low';

/** Reviewer 发现的单个问题 */
export interface ReflectionIssue {
  category: IssueCategory;
  description: string;
  severity: IssueSeverity;
}

/** Reviewer LLM 返回的审核结果 */
export interface ReviewResult {
  approved: boolean;
  /** 质量评分 1-5 */
  qualityScore: number;
  issues: ReflectionIssue[];
  suggestions: string[];
}

/** Reflection 产出的完整工件 */
export interface ReflectionArtifact {
  /** 被审核的原始输出快照 */
  envelopeSnapshot: AgentResponseEnvelope;
  /** verifier 产生的报告 */
  verificationReport: VerificationReport;
  /** reviewer LLM 的审核决策 */
  reviewResult: ReviewResult;
  /** 使用的 reviewer 模型信息 */
  reviewerModel: string;
  /** reflection 时间戳 */
  reflectedAt: string;
}
