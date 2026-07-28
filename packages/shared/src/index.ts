// Types — sandbox
export type {
  // 时间轴与原始流
  ActivitySegmentType,
  DemoClock,
  ActivitySegment,
  DeviceMetric,
  DeviceEvent,
  DeviceBufferState,
  SyncSession,
  RecognizedEventType,
  RecognitionSource,
  CalibrationStatus,
  SensorObservation,
  RecognizedEvent,
  DerivedTemporalStateType,
  DerivedTemporalState,
  // 沙箱基础
  BaselineMetrics,
  SandboxProfile,
  SleepStages,
  SleepData,
  ActivityData,
  StressData,
  SleepStageType,
  SensorSample,
  MotionPattern,
  ImuSample,
  DeviceSyncSession,
  DeviceConnection,
  IntradaySnapshot,
  DailyRecord,
  VitalSignsData,
  ProfileData,
} from './types/sandbox';

// Types — micro-event
export { MICRO_EVENT_TYPES } from './types/micro-event';
export type { MicroEventType, MicroEventParamValue, MicroEventParams } from './types/micro-event';

export type { DataCenterTimelinePoint, DataCenterResponse } from './types/data-center';

// Types — chart token
export { ChartTokenId } from './types/chart-token';

// Types — locale
export type { Locale, LocalizableText } from './types/locale';
export {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isValidLocale,
  parseLocale,
  localize,
} from './types/locale';

// Types — agent
export { AgentTaskType } from './types/agent';
export type {
  DataTab,
  Timeframe,
  PageContext,
  AgentResponseEnvelope,
  ActionOption,
  ActionInteraction,
  MemoryCandidateKind,
  MemoryCandidateConfirmation,
  FutureSuggestion,
  HomeTrendCardDisplay,
  ClientUiContext,
  HomeTrendCardSetDirective,
  UiDirective,
  AdvisorProactiveProposal,
  AdvisorProactiveInteraction,
  AdvisorProactiveAction,
  AdvisorProactivePrompt,
} from './types/agent';

// Types — plan
export type {
  PlanTimeOfDay,
  PlanTaskDraft,
  PlanGroupDraft,
  PlanDraftInput,
  PlanDraft,
  PlanTask,
  PlanGroup,
  PlanStatus,
  Plan,
  PlanProgress,
} from './types/plan';

// Types — brief-stream
// 运行时常量（BRIEF_STREAM_ERROR_CODES）放 types 区，沿用 micro-event 先例
export { BRIEF_STREAM_ERROR_CODES } from './types/brief-stream';
export type {
  BriefStartedEvent,
  BriefSummaryDeltaEvent,
  BriefCompletedEvent,
  BriefFailedEvent,
  BriefStreamEvent,
  BriefStreamErrorCode, // failed 事件允许的错误码
} from './types/brief-stream';

// Types — god-mode
export type {
  // 时间轴动作载荷
  TimelineAppendPayload,
  SyncTriggerPayload,
  AdvanceClockPayload,
  ResetProfileTimelinePayload,
  MicroEventAppendPayload,
  // 已有载荷
  ProfileSwitchPayload,
  EventInjectPayload,
  MetricOverridePayload,
  ResetPayload,
  ActiveSensingState,
  GodModeOverrideEntry,
  GodModeInjectedEvent,
  GodModeStateResponse,
  GodModeAction,
} from './types/god-mode';

// Types — profile-crud
export type {
  UpdateProfilePayload,
  CloneProfileOverrides,
  CloneProfilePayload,
  UpdateProfileResponse,
  CloneProfileResponse,
  DeleteProfileResponse,
  ResetProfileResponse,
} from './types/profile-crud';

// Types — api
export { ErrorCode } from './types/api';
export type { ApiMeta, ApiError, ApiResponse } from './types/api';
export { createSuccessResponse, createErrorResponse } from './types/api';

// Types — stress
export type {
  StressTimelinePoint,
  StressTrend,
  StressSummaryStats,
  StressTimelineResponse,
} from './types/stress';

// Schemas
export {
  // 时间轴与原始流
  ActivitySegmentTypeSchema,
  DemoClockSchema,
  ActivitySegmentSchema,
  DeviceMetricSchema,
  DeviceEventSchema,
  DeviceBufferStateSchema,
  SyncSessionSchema,
  RecognizedEventTypeSchema,
  RecognitionSourceSchema,
  CalibrationStatusSchema,
  SensorObservationSchema,
  RecognizedEventSchema,
  DerivedTemporalStateTypeSchema,
  DerivedTemporalStateSchema,
  // 沙箱基础
  BaselineMetricsSchema,
  SandboxProfileSchema,
  SleepStagesSchema,
  SleepDataSchema,
  ActivityDataSchema,
  StressDataSchema,
  SleepStageTypeSchema,
  SensorSampleSchema,
  ImuSampleSchema,
  MotionPatternSchema,
  DeviceSyncSessionSchema,
  DeviceConnectionSchema,
  IntradaySnapshotSchema,
  DailyRecordSchema,
  ProfileDataSchema,
} from './schemas/sandbox';

// Schemas — micro-event
export { MicroEventTypeSchema, MicroEventParamsSchema } from './schemas/micro-event';

export {
  AgentTaskTypeSchema,
  DataTabSchema,
  TimeframeSchema,
  PageContextSchema,
  AgentResponseEnvelopeSchema,
  ActionOptionSchema,
  ActionInteractionSchema,
  MemoryCandidateConfirmationSchema,
  FutureSuggestionSchema,
  HomeTrendCardDisplaySchema,
  ClientUiContextSchema,
  HomeTrendCardSetDirectiveSchema,
  UiDirectiveSchema,
  AdvisorProactiveProposalSchema,
  AdvisorProactiveInteractionSchema,
  AdvisorProactiveActionSchema,
  AdvisorProactivePromptSchema,
} from './schemas/agent';

// Schemas — plan
export {
  MAX_PLAN_GROUPS,
  MAX_PLAN_TASKS_PER_GROUP,
  PlanTaskDraftSchema,
  PlanGroupDraftSchema,
  PlanDraftInputSchema,
  PlanTaskSchema,
  PlanGroupSchema,
  PlanProgressSchema,
  PlanStatusSchema,
  PlanSchema,
  PlanDraftSchema,
  PlanTaskUpdateRequestSchema,
  PlanReplaceConfirmSchema,
} from './schemas/plan';

// Schemas — brief-stream
export {
  BriefStreamEventSchema,
  isBriefStreamTerminalEvent,
} from './schemas/brief-stream';

export { ChartTokenIdSchema, isValidChartTokenId } from './schemas/chart-token';

export {
  // 时间轴动作 Schema
  TimelineAppendPayloadSchema,
  SyncTriggerPayloadSchema,
  AdvanceClockPayloadSchema,
  ResetProfileTimelinePayloadSchema,
  MicroEventAppendPayloadSchema,
  // 已有 Schema
  ProfileSwitchPayloadSchema,
  EventInjectPayloadSchema,
  MetricOverridePayloadSchema,
  ResetPayloadSchema,
} from './schemas/god-mode';

// Schemas — profile-crud
export { UpdateProfileRequestSchema, CloneProfileRequestSchema } from './schemas/profile-crud';

export { ErrorCodeSchema, ApiMetaSchema, ApiErrorSchema, ApiResponseSchema } from './schemas/api';

export {
  StressTimelinePointSchema,
  StressTrendSchema,
  StressSummaryStatsSchema,
  StressTimelineResponseSchema,
} from './schemas/stress';

// Constants
export * from './constants';

// Utils
export * from './utils';
