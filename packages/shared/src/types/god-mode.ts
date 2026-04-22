import type {
  ActivitySegmentType,
  RecognizedEvent,
  DerivedTemporalState,
} from './sandbox';

// ============================================================
// God Mode 时间轴动作载荷（新增）
// ============================================================

/** 时间轴追加片段载荷 */
export interface TimelineAppendPayload {
  segmentType: ActivitySegmentType;
  /** 片段持续时长（分钟），不提供时使用各片段类型的默认时长 */
  durationMinutes?: number;
  /** 起始偏移分钟数（默认 0） */
  offsetMinutes?: number;
  /** 片段参数 */
  params?: Record<string, number | string | boolean>;
  /** 是否推进时钟（默认 true） */
  advanceClock?: boolean;
}

/** 同步触发载荷 */
export interface SyncTriggerPayload {
  trigger: 'app_open' | 'manual_refresh';
}

/** 时钟推进载荷 */
export interface AdvanceClockPayload {
  /** 必须 > 0 */
  minutes: number;
}

/** 重置 profile 时间轴载荷 */
export interface ResetProfileTimelinePayload {
  profileId: string;
}

// ============================================================
// God Mode 动作载荷（已有）
// ============================================================

export interface ProfileSwitchPayload {
  profileId: string;
}

export interface EventInjectPayload {
  eventType: string;
  data: Record<string, unknown>;
  timestamp?: string;
}

export interface MetricOverridePayload {
  metric: string;
  value: unknown;
  dateRange?: { start: string; end: string };
}

export interface ResetPayload {
  scope: 'profile' | 'events' | 'overrides' | 'all';
}

export interface ScenarioPayload {
  scenarioId: string;
  params?: Record<string, unknown>;
}

export type ScenarioType =
  | 'profile_switch'
  | 'event_inject'
  | 'metric_override'
  | 'reset'
  | 'demo_script'
  | 'timeline_append'
  | 'sync_trigger'
  | 'advance_clock'
  | 'reset_profile_timeline';

export interface ScenarioStep {
  label: string;
  action: Exclude<ScenarioType, 'demo_script'>;
  payload: Record<string, unknown>;
}

export interface ScenarioEntry {
  scenarioId: string;
  label: string;
  description: string;
  type: ScenarioType;
  payload?: Record<string, unknown>;
  steps?: ScenarioStep[];
}

export interface ActiveSensingState {
  visible: boolean;
  priority: 'normal' | 'high';
  surface: 'banner' | 'data-only';
  date: string;
  events: string[];
}

export interface GodModeOverrideEntry {
  metric: string;
  value: unknown;
  dateRange?: { start: string; end: string };
}

export interface GodModeInjectedEvent {
  date: string;
  type: string;
  data: Record<string, unknown>;
}

export interface GodModeStateResponse {
  currentProfileId: string;
  activeOverrides: GodModeOverrideEntry[];
  injectedEvents: GodModeInjectedEvent[];
  availableScenarios: ScenarioEntry[];
  activeSensing: ActiveSensingState | null;
  /** 当前演示时间 YYYY-MM-DDTHH:mm */
  currentDemoTime: string | null;
  /** 上次同步时间 YYYY-MM-DDTHH:mm */
  lastSyncTime: string | null;
  pendingEventCount: number;
  recentRecognizedEvents: RecognizedEvent[];
  recentDerivedStates: DerivedTemporalState[];
}

export interface DemoScriptStepResult {
  label: string;
  action: Exclude<ScenarioType, 'demo_script'>;
  status: 'success' | 'error';
  detail?: string;
}

export interface DemoScriptRunResponse {
  scenarioId: string;
  label: string;
  executedSteps: DemoScriptStepResult[];
  state: GodModeStateResponse;
}

export type GodModeAction =
  | { type: 'profile_switch'; payload: ProfileSwitchPayload }
  | { type: 'event_inject'; payload: EventInjectPayload }
  | { type: 'metric_override'; payload: MetricOverridePayload }
  | { type: 'reset'; payload: ResetPayload }
  | { type: 'scenario'; payload: ScenarioPayload }
  | { type: 'timeline_append'; payload: TimelineAppendPayload }
  | { type: 'sync_trigger'; payload: SyncTriggerPayload }
  | { type: 'advance_clock'; payload: AdvanceClockPayload }
  | { type: 'reset_profile_timeline'; payload: ResetProfileTimelinePayload };
