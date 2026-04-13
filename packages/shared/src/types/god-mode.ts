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
  | 'demo_script';

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
  | { type: 'scenario'; payload: ScenarioPayload };
