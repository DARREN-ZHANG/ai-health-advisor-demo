import type { RuntimeRegistry } from '../../runtime/registry.js';
import type { OverrideEntry, DatedEvent } from '@health-advisor/sandbox';
import { recognizeEvents, computeDerivedTemporalStates } from '@health-advisor/sandbox';
import type {
  ActiveSensingState,
  ActivitySegmentType,
  DemoScriptRunResponse,
  DemoScriptStepResult,
  EventInjectPayload,
  GodModeStateResponse,
  MetricOverridePayload,
  ResetPayload,
  ScenarioEntry,
  ScenarioStep,
} from '@health-advisor/shared';

export class GodModeService {
  constructor(private registry: RuntimeRegistry) {}

  /** BE-022: 切换 profile，清空旧 profile 的 session/analytical memory */
  switchProfile(profileId: string, sessionId?: string): GodModeStateResponse {
    // 验证 profile 存在
    this.registry.getRawProfile(profileId);

    this.registry.overrideStore.switchProfile(profileId);

    // 使用真实 sessionId 清空 session + analytical memory
    const effectiveSessionId = sessionId ?? `god-mode-${Date.now()}`;
    this.registry.sessionStore.clearOnProfileSwitch(effectiveSessionId);
    this.registry.analyticalMemory.invalidateOnProfileSwitch(effectiveSessionId);

    return this.getState();
  }

  /** BE-023: 注入事件 */
  injectEvent(profileId: string, payload: EventInjectPayload, sessionId?: string): GodModeStateResponse {
    const event: DatedEvent = {
      date: payload.timestamp ?? new Date().toISOString().slice(0, 10),
      type: payload.eventType,
      data: payload.data,
    };
    this.registry.overrideStore.injectEvent(profileId, event);
    this.invalidateSessionAnalytical(sessionId);
    return this.getStateForProfile(profileId);
  }

  /** BE-024: 覆盖指标 */
  overrideMetric(profileId: string, payload: MetricOverridePayload, sessionId?: string): GodModeStateResponse {
    const entry: OverrideEntry = {
      metric: payload.metric,
      value: payload.value,
      ...(payload.dateRange ? { dateRange: payload.dateRange } : {}),
    };
    this.registry.overrideStore.addOverride(profileId, entry);
    this.invalidateSessionAnalytical(sessionId);
    return this.getStateForProfile(profileId);
  }

  /** BE-025: reset / restore */
  reset(payload: ResetPayload, sessionId?: string): GodModeStateResponse {
    this.registry.overrideStore.reset(payload.scope);

    if (payload.scope === 'all') {
      this.registry.sessionStore.clearAll();
      this.registry.analyticalMemory.clearAll();
      return this.getState();
    }

    if (sessionId && payload.scope === 'profile') {
      this.registry.sessionStore.clearOnProfileSwitch(sessionId);
    }

    this.invalidateSessionAnalytical(sessionId);
    return this.getState();
  }

  /** BE-025A: 获取当前 God-Mode 状态 */
  getState(): GodModeStateResponse {
    const currentProfileId = this.registry.overrideStore.getCurrentProfileId();
    return this.getStateForProfile(currentProfileId);
  }

  /** 追加活动片段到时间轴 */
  appendToTimeline(
    segmentType: ActivitySegmentType,
    params?: Record<string, number | string | boolean>,
    offsetMinutes?: number,
    sessionId?: string,
    options?: { durationMinutes?: number; advanceClock?: boolean },
  ): GodModeStateResponse {
    const currentProfileId = this.registry.overrideStore.getCurrentProfileId();
    this.registry.overrideStore.appendSegment(currentProfileId, segmentType, params, offsetMinutes, options);
    this.invalidateSessionAnalytical(sessionId);
    return this.getStateForProfile(currentProfileId);
  }

  /** 触发同步 */
  triggerSync(trigger: 'app_open' | 'manual_refresh', sessionId?: string): GodModeStateResponse {
    const currentProfileId = this.registry.overrideStore.getCurrentProfileId();
    this.registry.overrideStore.performSync(currentProfileId, trigger);
    this.invalidateSessionAnalytical(sessionId);
    return this.getStateForProfile(currentProfileId);
  }

  /** 推进时钟 */
  advanceClock(minutes: number): GodModeStateResponse {
    const currentProfileId = this.registry.overrideStore.getCurrentProfileId();
    this.registry.overrideStore.advanceClock(currentProfileId, minutes);
    return this.getStateForProfile(currentProfileId);
  }

  /** 重置时间轴 */
  resetProfileTimeline(profileId: string, sessionId?: string): GodModeStateResponse {
    this.registry.overrideStore.resetProfileTimeline(profileId);
    this.invalidateSessionAnalytical(sessionId);
    return this.getState();
  }

  /** 获取指定 profile 的 God-Mode 状态 */
  private getStateForProfile(profileId: string): GodModeStateResponse {
    const currentProfileId = this.registry.overrideStore.getCurrentProfileId();
    const clock = this.registry.overrideStore.getDemoClock(profileId);
    const syncState = this.registry.overrideStore.getSyncState(profileId);
    const pendingEvents = this.registry.overrideStore.getPendingEvents(profileId);

    // 从已同步事件计算识别结果和派生状态
    const syncedEvents = this.registry.overrideStore.getSyncedEvents(profileId);
    const currentTime = clock.currentTime ?? new Date().toISOString().slice(0, 16);
    const recognizedEvents = recognizeEvents(syncedEvents, profileId, currentTime);
    const derivedStates = computeDerivedTemporalStates(recognizedEvents, currentTime, profileId);

    return {
      currentProfileId,
      activeOverrides: this.registry.overrideStore.getActiveOverrides(profileId),
      injectedEvents: this.registry.overrideStore.getInjectedEvents(profileId),
      availableScenarios: this.registry.scenarioRegistry.list(),
      activeSensing: this.deriveActiveSensing(profileId),
      // 时间轴同步状态字段
      currentDemoTime: clock.currentTime,
      lastSyncTime: syncState.lastSyncedMeasuredAt,
      pendingEventCount: pendingEvents.length,
      recentRecognizedEvents: recognizedEvents,
      recentDerivedStates: derivedStates,
    };
  }

  /** BE-025A: 应用单步 scenario */
  applyScenario(scenarioId: string, sessionId?: string): GodModeStateResponse {
    const scenario = this.registry.scenarioRegistry.getById(scenarioId);
    if (!scenario) {
      throw Object.assign(new Error(`Scenario '${scenarioId}' not found`), { statusCode: 404 });
    }
    if (scenario.type === 'demo_script') {
      throw Object.assign(new Error(`Scenario '${scenarioId}' must be run via demo-script API`), { statusCode: 400 });
    }
    if (!scenario.payload) {
      throw Object.assign(new Error(`Scenario '${scenarioId}' is missing payload`), { statusCode: 500 });
    }

    this.executeStep(scenario.type, scenario.payload, sessionId);
    return this.getState();
  }

  /** BE-025A: 执行 demo-script */
  runDemoScript(scenarioId: string, sessionId?: string): DemoScriptRunResponse {
    const scenario = this.registry.scenarioRegistry.getById(scenarioId);
    if (!scenario) {
      throw Object.assign(new Error(`Scenario '${scenarioId}' not found`), { statusCode: 404 });
    }
    if (scenario.type !== 'demo_script' || !scenario.steps) {
      throw Object.assign(new Error(`Scenario '${scenarioId}' is not a demo_script`), { statusCode: 400 });
    }

    const executedSteps: DemoScriptStepResult[] = [];

    for (const step of scenario.steps) {
      try {
        this.executeStep(step.action, step.payload, sessionId);
        executedSteps.push({ label: step.label, action: step.action, status: 'success' });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        executedSteps.push({ label: step.label, action: step.action, status: 'error', detail });
      }
    }

    return {
      scenarioId,
      label: scenario.label,
      executedSteps,
      state: this.getState(),
    };
  }

  private executeStep(action: ScenarioStep['action'] | ScenarioEntry['type'], payload: Record<string, unknown>, sessionId?: string): void {
    switch (action) {
      case 'profile_switch':
        this.switchProfile(payload.profileId as string, sessionId);
        break;
      case 'event_inject':
        this.injectEvent(this.registry.overrideStore.getCurrentProfileId(), {
          eventType: payload.eventType as string,
          data: (payload.data as Record<string, unknown>) ?? {},
          timestamp: payload.timestamp as string | undefined,
        }, sessionId);
        break;
      case 'metric_override':
        this.overrideMetric(this.registry.overrideStore.getCurrentProfileId(), {
          metric: payload.metric as string,
          value: payload.value,
          dateRange: payload.dateRange as { start: string; end: string } | undefined,
        }, sessionId);
        break;
      case 'reset':
        this.reset({ scope: (payload.scope as 'profile' | 'events' | 'overrides' | 'all') }, sessionId);
        break;
      case 'timeline_append':
        this.appendToTimeline(
          payload.segmentType as ActivitySegmentType,
          payload.params as Record<string, number | string | boolean> | undefined,
          payload.offsetMinutes as number | undefined,
          sessionId,
          {
            durationMinutes: payload.durationMinutes as number | undefined,
            advanceClock: payload.advanceClock as boolean | undefined,
          },
        );
        break;
      case 'sync_trigger':
        this.triggerSync(
          payload.trigger as 'app_open' | 'manual_refresh',
          sessionId,
        );
        break;
      case 'advance_clock':
        this.advanceClock(payload.minutes as number);
        break;
      case 'reset_profile_timeline':
        this.resetProfileTimeline(
          payload.profileId as string,
          sessionId,
        );
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  private deriveActiveSensing(currentProfileId: string): ActiveSensingState | null {
    const injectedEvents = this.registry.overrideStore.getInjectedEvents(currentProfileId);
    if (injectedEvents.length === 0) {
      return null;
    }

    const latestEvent = injectedEvents[injectedEvents.length - 1];
    if (!latestEvent) {
      return null;
    }

    return {
      visible: true,
      priority: 'high',
      surface: 'banner',
      date: latestEvent.date,
      events: [latestEvent.type],
    };
  }

  /** 数据变更后失效 session 的 analytical memory，防止 AI 请求用过期上下文 */
  private invalidateSessionAnalytical(sessionId?: string): void {
    if (!sessionId) return;
    // 完整清空（含 latestHomepageBrief），因为 God-Mode 变更底层数据后所有缓存摘要均失效
    this.registry.analyticalMemory.invalidateOnProfileSwitch(sessionId);
  }
}
