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

export type GodModeAction =
  | { type: 'profile_switch'; payload: ProfileSwitchPayload }
  | { type: 'event_inject'; payload: EventInjectPayload }
  | { type: 'metric_override'; payload: MetricOverridePayload }
  | { type: 'reset'; payload: ResetPayload }
  | { type: 'scenario'; payload: ScenarioPayload };
