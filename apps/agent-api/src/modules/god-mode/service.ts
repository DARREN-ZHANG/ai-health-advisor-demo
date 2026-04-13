import type { RuntimeRegistry } from '../../runtime/registry.js';
import type { OverrideEntry, DatedEvent } from '@health-advisor/sandbox';
import type {
  ActiveSensingState,
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
    return this.getState();
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
    return this.getState();
  }

  /** BE-025: reset / restore */
  reset(payload: ResetPayload, sessionId?: string): GodModeStateResponse {
    this.registry.overrideStore.reset(payload.scope);
    if (sessionId && (payload.scope === 'profile' || payload.scope === 'all')) {
      this.registry.sessionStore.clearOnProfileSwitch(sessionId);
    }
    this.invalidateSessionAnalytical(sessionId);
    return this.getState();
  }

  /** BE-025A: 获取当前 God-Mode 状态 */
  getState(): GodModeStateResponse {
    const currentProfileId = this.registry.overrideStore.getCurrentProfileId();
    return {
      currentProfileId,
      activeOverrides: this.registry.overrideStore.getActiveOverrides(currentProfileId),
      injectedEvents: this.registry.overrideStore.getInjectedEvents(currentProfileId),
      availableScenarios: this.registry.scenarioRegistry.list(),
      activeSensing: this.deriveActiveSensing(currentProfileId),
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
