import type { AgentRequest } from '../types/agent-request';
import type { AgentResponseEnvelope } from '@health-advisor/shared';
import type { AgentContext } from '../types/agent-context';
import type { RuleEvaluationResult } from '../rules/types';

// ── 枚举类型 ──────────────────────────────────────────

export type EvalSuite = 'smoke' | 'core' | 'regression';
export type EvalCategory = 'homepage' | 'view-summary' | 'advisor-chat' | 'cross-cutting';
export type EvalPriority = 'P0' | 'P1' | 'P2';
export type EvalProviderMode = 'fake' | 'real';

// ── Agent 评测 Case ──────────────────────────────────

export interface AgentEvalCase {
  id: string;
  title: string;
  suite: EvalSuite;
  category: EvalCategory;
  priority: EvalPriority;
  tags: string[];
  setup: AgentEvalSetup;
  request: AgentRequest;
  expectations: AgentEvalExpectations;
}

// ── Setup：评测前置条件 ──────────────────────────────

export interface AgentEvalSetup {
  profileId: string;

  memory?: {
    sessionMessages?: Array<{
      role: 'user' | 'assistant';
      text: string;
      createdAt?: number;
    }>;
    analytical?: {
      latestHomepageBrief?: string;
      latestViewSummaryByScope?: Record<string, string>;
      latestRuleSummary?: string;
    };
  };

  overrides?: Array<{
    metric: string;
    value: unknown;
    dateRange?: { start: string; end: string };
  }>;

  injectedEvents?: Array<{
    date: string;
    type: string;
    data?: Record<string, unknown>;
  }>;

  timeline?: {
    performSync?: 'app_open' | 'manual_refresh';
    appendSegments?: Array<{
      segmentType: string;
      params?: Record<string, number | string | boolean>;
      offsetMinutes?: number;
      durationMinutes?: number;
      advanceClock?: boolean;
    }>;
  };

  referenceDate?: string;
  modelFixture?: {
    mode: 'fake-json' | 'fake-invalid-json' | 'fake-invalid-output' | 'fake-timeout' | 'real-provider';
    content?: string;
  };
}

// ── Expectations：断言配置 ───────────────────────────

export interface AgentEvalExpectations {
  protocol?: {
    requireValidEnvelope?: boolean;
    expectedSource?: 'llm' | 'fallback' | 'rule';
    expectedFinishReason?: 'complete' | 'fallback' | 'timeout';
  };

  summary?: {
    length?: { min?: number; max?: number };
    mustMention?: string[];
    mustMentionAny?: string[][];
    mustNotMention?: string[];
    requiredPatterns?: string[];
    forbiddenPatterns?: string[];
  };

  status?: {
    expectedStatusColor?: 'good' | 'warning' | 'error';
    allowedStatusColors?: Array<'good' | 'warning' | 'error'>;
  };

  chartTokens?: {
    required?: string[];
    requiredAny?: string[][];
    allowed?: string[];
    forbidden?: string[];
    maxCount?: number;
  };

  microTips?: {
    minCount?: number;
    maxCount?: number;
    requiredPatterns?: string[];
    forbiddenPatterns?: string[];
    requireActionableTiming?: boolean;
  };

  missingData?: {
    missingMetrics: string[];
    mustDiscloseInsufficientData?: boolean;
    forbiddenClaimPatterns?: string[];
  };

  evidence?: {
    requiredFacts?: Array<{
      id: string;
      metric?: string;
      eventType?: string;
      value?: number | string;
      unit?: string;
      mentionPatterns?: string[];
    }>;
    forbiddenFacts?: Array<{
      id: string;
      mentionPatterns: string[];
    }>;
  };

  safety?: {
    forbidDiagnosis?: boolean;
    forbidMedication?: boolean;
    forbidTreatmentPromise?: boolean;
    requireDoctorAdviceWhenCritical?: boolean;
    forbiddenPatterns?: string[];
  };

  memory?: {
    mustUsePreviousTurn?: boolean;
    requiredMemoryPatterns?: string[];
    forbiddenLeakPatterns?: string[];
  };

  taskSpecific?: {
    homepage?: {
      requireRecentEventFirst?: boolean;
      recentEventPatterns?: string[];
      require24hCrossAnalysis?: boolean;
      crossAnalysisPatterns?: {
        event?: string[];
        metric?: string[];
      };
      requireWeeklyTrendOptional?: boolean;
    };
    viewSummary?: {
      requiredTab?: string;
      forbidOtherTabs?: string[];
      requiredTabPatterns?: string[];
    };
    advisorChat?: {
      requiredTimeScope?: 'day' | 'week' | 'month' | 'year' | 'custom';
      requiredTimeScopePatterns?: string[];
      mustAnswerUserQuestion?: boolean;
      answerPatterns?: string[];
    };
  };
}

// ── 评测结果 ──────────────────────────────────────────

export interface EvalCheckResult {
  checkId: string;
  severity: 'hard' | 'soft';
  passed: boolean;
  score: number;
  maxScore: number;
  message: string;
  details?: Record<string, unknown>;
}

export interface EvalArtifacts {
  caseId: string;
  request: AgentRequest;
  context?: AgentContext;
  rulesResult?: RuleEvaluationResult;
  systemPrompt?: string;
  taskPrompt?: string;
  rawOutput?: string;
  envelope?: AgentResponseEnvelope;
  parseError?: string;
  thrownError?: string;
}

export interface EvalCaseResult {
  caseId: string;
  passed: boolean;
  score: number;
  maxScore: number;
  checks: EvalCheckResult[];
  artifacts: EvalArtifacts;
}

// ── Scorer 输入 ──────────────────────────────────────────

export interface EvalScorerInput {
  evalCase: AgentEvalCase;
  envelope?: AgentResponseEnvelope;
  artifacts: EvalArtifacts;
}

// ── 评测报告 ──────────────────────────────────────────

export interface EvalReport {
  runId: string;
  gitSha?: string;
  createdAt: string;
  suite: string;
  providerMode: 'fake' | 'real';
  /** 使用的 provider（如 openai、gemini），仅 real 模式有值 */
  provider?: string;
  /** 使用的模型名称（如 gpt-4o-mini），仅 real 模式有值 */
  model?: string;
  totals: {
    cases: number;
    passed: number;
    failed: number;
    hardFailures: number;
    score: number;
    maxScore: number;
  };
  byCategory: Record<
    string,
    {
      cases: number;
      passed: number;
      failed: number;
      score: number;
      maxScore: number;
    }
  >;
  cases: EvalCaseResult[];
}
