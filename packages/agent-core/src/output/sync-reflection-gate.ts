import type { AgentResponseEnvelope } from '@health-advisor/shared';
import type { AnalysisPlan } from '../planner/analysis-plan';
import type { VerifierInput } from './verifier';
import type { VerificationReport } from './verification-report';
import { verifyOutput } from './verifier';
import type { SyncReflectionReviewer } from './reflection-reviewer';
import type { ReflectionReviewResult } from './reflection-schema';

/** Sync Gate 依赖 */
export interface SyncGateDeps {
  reviewer: SyncReflectionReviewer;
  verifierInput: VerifierInput;
  plan?: AnalysisPlan;
  collectedEvidence?: unknown[];
}

/** Sync Gate 结果 */
export interface SyncGateResult {
  approved: boolean;
  reviewResult?: ReflectionReviewResult;
  verificationReport?: VerificationReport;
  regenerated?: boolean;
}

/**
 * 运行同步审核闸门。
 * 这是一个同步阻断调用：先运行 verifier，再运行 sync reviewer。
 * 不通过时返回 rejection，由上层决定是否重生成。
 */
export async function runSyncReflectionGate(
  deps: SyncGateDeps,
  envelope: AgentResponseEnvelope,
): Promise<SyncGateResult> {
  // 1. 运行 verifier（确定性检查）
  let report: VerificationReport;
  try {
    report = verifyOutput(deps.verifierInput);
  } catch {
    // verifier 异常时使用安全默认报告
    report = {
      envelope,
      context: { taskType: 'advisor_chat', missingData: [], visibleCharts: [], ruleInsights: [] },
      violations: [],
      summary: { total: 0, passed: 0, failed: 0, hardFailures: 0 },
      verifiedAt: new Date().toISOString(),
    };
  }

  // 2. 运行 sync reviewer（LLM 审核）
  const review = await deps.reviewer.review({
    envelope,
    verificationReport: report,
    plan: deps.plan,
    collectedEvidence: deps.collectedEvidence,
  });

  if (review.approved) {
    return { approved: true, reviewResult: review, verificationReport: report };
  }

  // 3. 不通过 → 返回 rejection
  return { approved: false, reviewResult: review, verificationReport: report, regenerated: false };
}
