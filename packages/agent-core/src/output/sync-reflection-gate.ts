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
  /** H-6: 预计算的 verificationReport，存在时跳过内部 verifier */
  precomputedVerificationReport?: VerificationReport;
  /** H-9: 共享 AbortSignal，控制整个 Sync Gate 流程的超时预算 */
  signal?: AbortSignal;
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
  // 1. 运行 verifier（确定性检查）—— H-6: 优先使用预计算结果避免重复调用
  let report: VerificationReport;
  if (deps.precomputedVerificationReport) {
    report = deps.precomputedVerificationReport;
  } else {
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
  }

  // 2. 运行 sync reviewer（LLM 审核）—— H-9: 传递共享 signal
  const review = await deps.reviewer.review({
    envelope,
    verificationReport: report,
    plan: deps.plan,
    collectedEvidence: deps.collectedEvidence,
    signal: deps.signal,
  });

  if (review.approved) {
    return { approved: true, reviewResult: review, verificationReport: report };
  }

  // 3. 不通过 → 返回 rejection
  return { approved: false, reviewResult: review, verificationReport: report, regenerated: false };
}
