// @health-advisor/agent-core — Agent Runtime Foundation

// Types
export type { AgentRequest } from './types/agent-request';
export type { InternalTaskType } from './types/internal-task-type';
export type { AgentContext, AgentStatusColor, TimelineSyncContext } from './types/agent-context';
export type {
  ConversationMessage,
  SessionConversationMemory,
  AnalyticalMemory,
} from './types/memory';
export type { LlmProvider, ModelRuntimeConfig, ResolvedProviderConfig, LlmRole, ResolvedLlmConfig } from './types/provider';

// Schemas
export { AgentRequestSchema } from './types/agent-request';

// Routing
export { resolveTaskRoute, TASK_ROUTES } from './routing/task-router';
export type { TaskRoute } from './routing/task-router';
export { validateTaskRequest } from './routing/task-validator';
export type { TaskValidationResult } from './routing/task-validator';

// Provider
export { resolveProviderConfig, resolveAllLlmConfigs } from './provider/provider-config';
export { createChatModel, createChatModelForRole } from './provider/model-factory';
export { FakeChatModel } from './provider/fake-chat-model';

// Executor
export { createHealthAgent } from './executor/create-agent';
export type { AgentConfig, HealthAgent, AgentInvokeInput, AgentInvokeOutput } from './executor/create-agent';
export { initializeAgent, initializeAgents } from './executor/agent-initializer';

// Memory
export { InMemorySessionMemoryStore } from './memory/session-memory-store';
export type { SessionMemoryStore } from './memory/session-memory-store';
export { InMemoryAnalyticalMemoryStore } from './memory/analytical-memory-store';
export type { AnalyticalMemoryStore } from './memory/analytical-memory-store';
export { trimConversationTurns, isSessionExpired } from './memory/memory-policy';

// Context
export { buildAgentContext } from './context/context-builder';
export type { ContextBuilderDeps } from './context/context-types';
export { selectWindowByTask } from './context/window-selector';
export { detectMissingFields } from './context/missing-fields';

// Context Packet (new)
export type {
  TaskContextPacket,
  TaskPacket,
  UserContextPacket,
  DataWindowPacket,
  EvidenceFact,
  EvidenceSource,
  MissingDataItem,
  MissingDataScope,
  MetricSummary,
  MetricValue,
  MetricName,
  MissingDataCoverage,
  MetricAnomalyPoint,
  VisibleChartPacket,
  HomepageContextPacket,
  ViewSummaryContextPacket,
  AdvisorChatContextPacket,
  QuestionIntentPacket,
  CurrentPagePacket,
  RelevantFactPacket,
  ConversationPacket,
  AdvisorConstraintPacket,
  Latest24hPacket,
  Latest24hMetric,
  RecentEventPacket,
  RuleInsightPacket,
} from './context/context-packet';
export { buildTaskContextPacket } from './context/context-packet-builder';
export { createEvidenceCollector } from './context/evidence-packet';
export type { EvidenceCollector } from './context/evidence-packet';
export {
  buildMetricSummary,
  buildMetricSummaries,
  getMetricValue,
  getMetricUnit,
  getRestingHR,
} from './context/metric-summary';
export {
  buildMissingDataPacket,
  buildMissingDataForScope,
  findLastAvailableDate,
} from './context/missing-data-packet';
export {
  buildVisibleChartPackets,
  getChartTokenForTab,
  getMetricForTab,
} from './context/visible-chart-packet';
export { parseQuestionIntent } from './context/advisor-intent';

// Constants
export {
  MAX_TURNS,
  SESSION_TTL_MS,
  AGENT_SLA_TIMEOUT_MS,
  MAX_CHART_TOKENS,
  MAX_MICRO_TIPS,
  LOW_DATA_THRESHOLD,
} from './constants/limits';

export {
  DEFAULT_PROVIDER,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_RETRIES,
  ROLE_DEFAULTS,
} from './constants/defaults';

// Internal helpers
export { isSharedTaskType, INTERNAL_TASK_TYPES } from './types/internal-task-type';

// Rules (AGT-009 ~ AGT-011)
export { InsightRuleEngine } from './rules/rule-engine';
export type { InsightRule, InsightSignal, RuleEvaluationResult, InsightSeverity, InsightCategory } from './rules/types';
export { homepageRules, evaluateHomepageRules } from './rules/homepage-rules';
export { viewSummaryRules, evaluateViewSummaryRules } from './rules/view-summary-rules';

// Prompts (AGT-012 ~ AGT-014)
export { createPromptLoader } from './prompts/prompt-loader';
export type { PromptLoader, PromptName } from './prompts/prompt-loader';
export { buildSystemPrompt } from './prompts/system-builder';
export { buildTaskPrompt } from './prompts/task-builder';
export { renderTaskContextPacket } from './prompts/context-packet-renderer';

// Output (AGT-015 ~ AGT-017)
export { parseAgentResponse } from './output/response-parser';
export type { ParseResult, ParseSuccess, ParseFailure } from './output/response-parser';
export { validateChartTokens } from './output/token-validator';
export type { TokenValidationResult } from './output/token-validator';
export { cleanSafetyIssues } from './output/safety-cleaner';
export type { SafetyCleanResult, SafetyFlag } from './output/safety-cleaner';

// Verification (P0)
export { verifyOutput } from './output/verifier';
export type { VerifierInput } from './output/verifier';
export type { QualityViolation, VerificationReport, ViolationSeverity } from './output/verification-report';

// Reflection (P0)
export { ReflectionObserver } from './output/reflection-observer';
export type { ReflectionObserverDeps, ReflectionObserverInput } from './output/reflection-observer';
export type {
  ReflectionArtifact,
  ReflectionIssue,
  ReviewResult,
  IssueCategory,
  IssueSeverity,
} from './output/reflection-types';

// Bad Case Writer (P0)
export { convertToBadCase } from './evals/bad-case-writer';
export type { BadCaseArtifact } from './evals/bad-case-writer';

// Fallback (AGT-018)
export { createFallbackEngine } from './fallback/fallback-engine';
export type { FallbackEngine, FallbackAssets, FallbackEntry, FallbackLookupKey } from './fallback/fallback-engine';

// Runtime (AGT-019 ~ AGT-020)
export { withTimeout, TimeoutError } from './runtime/timeout-controller';
export type { TimeoutController } from './runtime/timeout-controller';
export { executeAgent } from './runtime/agent-runtime';
export type { AgentRuntimeDeps, AgentRuntimeObserver } from './runtime/agent-runtime';

// Planner (P1)
export {
  AnalysisPlanSchema,
  MetricType,
  TimeScope,
  ActionIntent,
  SafetyConstraint,
} from './planner/analysis-plan';
export type {
  AnalysisPlan,
  PlanVerificationResult,
} from './planner/analysis-plan';
export { verifyAnalysisPlan } from './planner/analysis-plan-verifier';
export type { PlanVerifierContext } from './planner/analysis-plan-verifier';
export { buildAnalysisPlan, buildAnalysisPlanWithRetry } from './planner/advisor-plan-builder';
export type { PlanBuilderDeps, PlanBuilderInput, PlanBuilderResult } from './planner/advisor-plan-builder';

// Tools (P2)
export type {
  ToolDefinition,
  ToolExecutionContext,
  ToolResult,
  ToolError,
  ReActStep,
} from './tools/tool-types';
export { queryMetricSummaryTool } from './tools/query-metric-summary';
export { queryVisibleChartFactsTool } from './tools/query-visible-chart-facts';
export { queryMissingDataTool } from './tools/query-missing-data';
export { queryTimelineEventsTool } from './tools/query-timeline-events';

// Evidence Resolver (P2)
export { resolveEvidenceByPlan } from './planner/evidence-resolver';
export type { EvidenceResolutionResult } from './planner/evidence-resolver';

// ReAct Loop (P2)
export { runConstrainedReAct } from './executor/react-loop';
export type { ReActLoopDeps, ReActLoopInput, ReActLoopResult } from './executor/react-loop';
