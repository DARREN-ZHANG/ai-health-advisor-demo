import type { RuntimeRegistry } from '../../runtime/registry.js';
import type { OverrideEntry, DatedEvent } from '@health-advisor/sandbox';
import {
  recognizeEvents,
  buildRecognizeInputFromDeviceEvents,
  computeDerivedTemporalStates,
} from '@health-advisor/sandbox';
import type {
  ActiveSensingState,
  ActivitySegmentType,
  CloneProfilePayload,
  EventInjectPayload,
  GodModeStateResponse,
  MetricOverridePayload,
  MicroEventParams,
  MicroEventType,
  ResetPayload,
  UpdateProfilePayload,
} from '@health-advisor/shared';
import { localize, DEFAULT_LOCALE } from '@health-advisor/shared';

export class GodModeService {
  constructor(private registry: RuntimeRegistry) {}

  /** BE-022: 切换 profile，清空旧 profile 的 session/analytical memory */
  switchProfile(profileId: string, sessionId: string): GodModeStateResponse {
    const session = this.registry.getSessionSandbox(sessionId);
    // 验证 profile 存在
    session.getRawProfile(profileId);

    session.overrideStore.switchProfile(profileId);

    // 使用真实 sessionId 清空 session + analytical memory
    this.registry.sessionStore.clearOnProfileSwitch(sessionId);
    this.registry.analyticalMemory.invalidateOnProfileSwitch(sessionId);

    return this.getState(sessionId);
  }

  /** BE-023: 注入事件 */
  injectEvent(
    profileId: string,
    payload: EventInjectPayload,
    sessionId: string,
  ): GodModeStateResponse {
    const event: DatedEvent = {
      date: payload.timestamp ?? new Date().toISOString().slice(0, 10),
      type: payload.eventType,
      data: payload.data,
    };
    this.registry.getSessionSandbox(sessionId).overrideStore.injectEvent(profileId, event);
    this.invalidateSessionAnalytical(sessionId);
    return this.getStateForProfile(profileId, sessionId);
  }

  /** BE-024: 覆盖指标 */
  overrideMetric(
    profileId: string,
    payload: MetricOverridePayload,
    sessionId: string,
  ): GodModeStateResponse {
    const entry: OverrideEntry = {
      metric: payload.metric,
      value: payload.value,
      ...(payload.dateRange ? { dateRange: payload.dateRange } : {}),
    };
    this.registry.getSessionSandbox(sessionId).overrideStore.addOverride(profileId, entry);
    this.invalidateSessionAnalytical(sessionId);
    return this.getStateForProfile(profileId, sessionId);
  }

  /** BE-025: reset / restore */
  reset(payload: ResetPayload, sessionId: string): GodModeStateResponse {
    this.registry.getSessionSandbox(sessionId).overrideStore.reset(payload.scope);

    if (payload.scope === 'all') {
      this.registry.sessionStore.clearOnProfileSwitch(sessionId);
      this.registry.analyticalMemory.invalidateOnProfileSwitch(sessionId);
      return this.getState(sessionId);
    }

    if (payload.scope === 'profile') {
      this.registry.sessionStore.clearOnProfileSwitch(sessionId);
    }

    this.invalidateSessionAnalytical(sessionId);
    return this.getState(sessionId);
  }

  /** BE-025A: 获取当前 God-Mode 状态 */
  getState(sessionId: string): GodModeStateResponse {
    const currentProfileId = this.registry
      .getSessionSandbox(sessionId)
      .overrideStore.getCurrentProfileId();
    return this.getStateForProfile(currentProfileId, sessionId);
  }

  /** 追加微事件到时间轴 */
  appendMicroEvent(
    microEventType: MicroEventType,
    params?: MicroEventParams,
    sessionId?: string,
    options?: { durationMinutes?: number; advanceClock?: boolean; timeOfDay?: string },
  ): GodModeStateResponse {
    if (!sessionId) throw new Error('sessionId is required');
    const session = this.registry.getSessionSandbox(sessionId);
    const currentProfileId = session.overrideStore.getCurrentProfileId();
    const profile = session.getRawProfile(currentProfileId);
    const baseline =
      profile.profile?.dailyBaseline ??
      profile.profile?.weeklyBaseline ??
      profile.profile?.baseline;
    const enrichedParams = {
      ...params,
      ...(baseline
        ? {
            _baselineRestingHr: baseline.restingHr,
            _baselineHrv: baseline.hrv,
            _baselineSpo2: baseline.spo2,
          }
        : {}),
    };

    const currentDemoTime = session.overrideStore.getDemoClock(currentProfileId).currentTime;
    session.overrideStore.appendMicroEvent(currentProfileId, microEventType, enrichedParams, {
      durationMinutes: options?.durationMinutes,
      advanceClock: options?.timeOfDay ? false : options?.advanceClock,
      startTime: options?.timeOfDay
        ? `${currentDemoTime.slice(0, 10)}T${options.timeOfDay}`
        : undefined,
    });
    this.invalidateSessionAnalytical(sessionId);
    return this.getStateForProfile(currentProfileId, sessionId);
  }

  /** 追加活动片段到时间轴 */
  appendToTimeline(
    segmentType: ActivitySegmentType,
    params?: Record<string, number | string | boolean>,
    offsetMinutes?: number,
    sessionId?: string,
    options?: {
      durationMinutes?: number;
      advanceClock?: boolean;
      timeOfDay?: string;
      replaceSegmentId?: string;
    },
  ): GodModeStateResponse {
    if (!sessionId) throw new Error('sessionId is required');
    const session = this.registry.getSessionSandbox(sessionId);
    const currentProfileId = session.overrideStore.getCurrentProfileId();
    const currentDemoTime = session.overrideStore.getDemoClock(currentProfileId).currentTime;
    const startTime = options?.timeOfDay
      ? `${currentDemoTime.slice(0, 10)}T${options.timeOfDay}`
      : undefined;

    // 注入 profile 基线到 params，使生成器能基于用户实际生理特征生成数据
    const profile = session.getRawProfile(currentProfileId);
    const baseline =
      profile.profile?.dailyBaseline ??
      profile.profile?.weeklyBaseline ??
      profile.profile?.baseline;
    const enrichedParams = {
      ...params,
      ...(baseline
        ? {
            _baselineRestingHr: baseline.restingHr,
            _baselineHrv: baseline.hrv,
            _baselineSpo2: baseline.spo2,
          }
        : {}),
    };

    const appendResult = options?.replaceSegmentId
      ? session.overrideStore.replaceSegment(
          currentProfileId,
          options.replaceSegmentId,
          segmentType,
          enrichedParams,
          {
            durationMinutes: options.durationMinutes,
            startTime,
          },
        )
      : session.overrideStore.appendSegment(
          currentProfileId,
          segmentType,
          enrichedParams,
          offsetMinutes,
          {
            durationMinutes: options?.durationMinutes,
            advanceClock: options?.timeOfDay ? false : options?.advanceClock,
            startTime,
          },
        );

    // 同步注入 Active Sensing 事件，使 deriveActiveSensing 能反映最新操作
    // 使用 segment 的真实 mock 时间（从 timeline-append 计算，不受 advanceClock 影响）
    const isConfirmedLifeLog = params?.source === 'life_log';
    const bannerEventType = GodModeService.TIMELINE_TO_BANNER_EVENT[segmentType];
    if (isConfirmedLifeLog) {
      // 已确认的生活记录已经作为 timeline segment 进入识别管线，
      // 不再写一份无法随编辑/删除同步的 injected event。
    } else if (bannerEventType) {
      session.overrideStore.injectEvent(currentProfileId, {
        date: appendResult.segmentStart,
        type: bannerEventType,
        data: {
          source: segmentType,
          segmentStart: appendResult.segmentStart,
          segmentEnd: appendResult.segmentEnd,
          ...(params ?? {}),
        },
      });
    } else {
      // 非白名单事件也要注入，用于"覆盖"之前的状态
      session.overrideStore.injectEvent(currentProfileId, {
        date: appendResult.segmentStart,
        type: segmentType,
        data: { ...(params ?? {}) },
      });
    }

    this.invalidateSessionAnalytical(sessionId);
    return {
      ...this.getStateForProfile(currentProfileId, sessionId),
      lastTimelineSegmentId: appendResult.segmentId,
    };
  }

  removeTimelineSegment(segmentId: string, sessionId?: string): GodModeStateResponse | null {
    if (!sessionId) throw new Error('sessionId is required');
    const overrideStore = this.registry.getSessionSandbox(sessionId).overrideStore;
    const currentProfileId = overrideStore.getCurrentProfileId();
    if (!overrideStore.removeSegment(currentProfileId, segmentId)) {
      return null;
    }
    this.invalidateSessionAnalytical(sessionId);
    return this.getStateForProfile(currentProfileId, sessionId);
  }

  /** 推进时钟 */
  advanceClock(minutes: number, sessionId: string): GodModeStateResponse {
    const overrideStore = this.registry.getSessionSandbox(sessionId).overrideStore;
    const currentProfileId = overrideStore.getCurrentProfileId();
    overrideStore.advanceClock(currentProfileId, minutes);
    return this.getStateForProfile(currentProfileId, sessionId);
  }

  /** 重置时间轴 */
  resetProfileTimeline(profileId: string, sessionId: string): GodModeStateResponse {
    const overrideStore = this.registry.getSessionSandbox(sessionId).overrideStore;
    overrideStore.resetProfileTimeline(profileId);
    // 重置后自动同步 baseline 事件
    overrideStore.performSync(profileId, 'manual_refresh');
    this.invalidateSessionAnalytical(sessionId);
    return this.getState(sessionId);
  }

  /** 获取指定 profile 的 God-Mode 状态 */
  private getStateForProfile(profileId: string, sessionId: string): GodModeStateResponse {
    const session = this.registry.getSessionSandbox(sessionId);
    const currentProfileId = session.overrideStore.getCurrentProfileId();
    const clock = session.overrideStore.getDemoClock(profileId);
    const syncState = session.overrideStore.getSyncState(profileId);
    const pendingEvents = session.overrideStore.getPendingEvents(profileId);

    // 从已同步事件计算识别结果和派生状态
    const syncedEvents = session.overrideStore.getSyncedEvents(profileId);
    const currentTime = clock.currentTime ?? new Date().toISOString().slice(0, 16);
    // 任务 1.2：先建立无标签观察，再调用新签名
    // 辅助函数内部完成：micro event 分离、sensor event 投影
    const recognizeInput = buildRecognizeInputFromDeviceEvents(
      syncedEvents,
      profileId,
      currentTime,
    );
    const recognizedEvents = recognizeEvents(recognizeInput);
    const derivedStates = computeDerivedTemporalStates(recognizedEvents, currentTime, profileId);

    return {
      currentProfileId,
      activeOverrides: session.overrideStore.getActiveOverrides(profileId),
      injectedEvents: session.overrideStore.getInjectedEvents(profileId),
      activeSensing: this.deriveActiveSensing(profileId, sessionId),
      // 时间轴同步状态字段
      currentDemoTime: clock.currentTime,
      lastSyncTime: syncState.lastSyncedMeasuredAt,
      pendingEventCount: pendingEvents.length,
      recentRecognizedEvents: recognizedEvents,
      recentDerivedStates: derivedStates,
      availableProfiles: [...session.profiles.values()].map((p) => ({
        profileId: p.profile.profileId,
        name: localize(p.profile.name, DEFAULT_LOCALE),
      })),
    };
  }

  /** 时间轴片段类型到 Banner 事件类型的映射 */
  private static readonly TIMELINE_TO_BANNER_EVENT: Record<string, string> = {
    steady_cardio: 'sport_detected',
    intermittent_exercise: 'sport_detected',
    alcohol_intake: 'possible_alcohol_intake',
    caffeine_intake: 'possible_caffeine_intake',
  };

  /** 允许触发 Active Sensing Banner 的事件白名单 */
  private static readonly BANNER_EVENT_TYPES = new Set([
    'sport_detected',
    'possible_alcohol_intake',
    'possible_caffeine_intake',
  ]);

  private deriveActiveSensing(
    currentProfileId: string,
    sessionId: string,
  ): ActiveSensingState | null {
    const injectedEvents = this.registry
      .getSessionSandbox(sessionId)
      .overrideStore.getInjectedEvents(currentProfileId);
    if (injectedEvents.length === 0) {
      return null;
    }

    // 只响应最近一次注入的事件；不在白名单中则不显示 Banner
    const latestEvent = injectedEvents[injectedEvents.length - 1]!;
    if (!GodModeService.BANNER_EVENT_TYPES.has(latestEvent.type)) {
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

  /** 一键校准演示数据：以当前真实日期为演示日，重新生成 31 天历史数据 */
  recalibrate(sessionId: string): GodModeStateResponse {
    this.registry.getSessionSandbox(sessionId).profileManager.recalibrate();
    this.registry.sessionStore.clearOnProfileSwitch(sessionId);
    this.invalidateSessionAnalytical(sessionId);
    return this.getState(sessionId);
  }

  /** 检测演示数据是否过期（initialDemoTime 不是今天） */
  isDataStale(sessionId: string): boolean {
    const overrideStore = this.registry.getSessionSandbox(sessionId).overrideStore;
    const currentProfileId = overrideStore.getCurrentProfileId();
    const today = new Date().toISOString().slice(0, 10);
    return overrideStore.getDemoClock(currentProfileId).currentTime.slice(0, 10) !== today;
  }

  /** 自动校准：仅在数据过期时执行 recalibrate */
  autoCalibrate(sessionId: string): { recalibrated: boolean; reason: string } {
    if (!this.isDataStale(sessionId)) {
      return { recalibrated: false, reason: 'demo data is up-to-date' };
    }

    this.recalibrate(sessionId);
    return { recalibrated: true, reason: 'demo data was stale, recalibrated' };
  }

  /** 更新 profile 字段（局部更新） */
  updateProfile(profileId: string, changes: UpdateProfilePayload, sessionId: string) {
    const result = this.registry
      .getSessionSandbox(sessionId)
      .profileManager.updateProfile(profileId, changes);
    this.invalidateSessionAnalytical(sessionId);
    return result;
  }

  /** 克隆创建新 profile */
  cloneProfile(
    sourceProfileId: string,
    newProfileId: string,
    sessionId: string,
    overrides?: CloneProfilePayload['overrides'],
  ) {
    return this.registry
      .getSessionSandbox(sessionId)
      .profileManager.cloneProfile(sourceProfileId, newProfileId, overrides);
  }

  /** 删除 profile */
  deleteProfile(profileId: string, sessionId: string) {
    const session = this.registry.getSessionSandbox(sessionId);
    const currentProfileId = session.overrideStore.getCurrentProfileId();
    session.profileManager.deleteProfile(profileId);

    // 如果删除的是当前活跃 profile，切换到第一个可用 profile
    if (currentProfileId === profileId) {
      const remaining = [...session.profiles.keys()];
      if (remaining.length > 0) {
        session.overrideStore.switchProfile(remaining[0]!);
      }
    }

    return { deletedProfileId: profileId };
  }

  /** 恢复 profile 到原始模板 */
  resetProfile(profileId: string, sessionId: string) {
    const result = this.registry
      .getSessionSandbox(sessionId)
      .profileManager.resetProfile(profileId);
    this.invalidateSessionAnalytical(sessionId);
    return result;
  }

  /** 数据变更后失效 session 的 analytical memory，防止 AI 请求用过期上下文 */
  private invalidateSessionAnalytical(sessionId?: string): void {
    if (!sessionId) return;
    // 完整清空（含 latestHomepageBrief），因为 God-Mode 变更底层数据后所有缓存摘要均失效
    this.registry.analyticalMemory.invalidateOnProfileSwitch(sessionId);
  }
}
