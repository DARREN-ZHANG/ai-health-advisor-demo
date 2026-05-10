import type { AgentResponseEnvelope } from '@health-advisor/shared';

export type ViolationSeverity = 'hard' | 'soft';

export interface QualityViolation {
  ruleId: string;
  severity: ViolationSeverity;
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface VerificationReport {
  /** 被验证的 envelope（深拷贝） */
  envelope: AgentResponseEnvelope;
  /** 产生该 envelope 的上下文快照 */
  context: {
    taskType: string;
    missingData: string[];
    visibleCharts: string[];
    ruleInsights: string[];
  };
  /** 所有检查结果 */
  violations: QualityViolation[];
  /** 汇总 */
  summary: {
    total: number;
    passed: number;
    failed: number;
    hardFailures: number;
  };
  /** 时间戳 */
  verifiedAt: string;
}
