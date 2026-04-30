import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RuntimeRegistry } from '../../runtime/registry.js';
import type { OverrideEntry, DatedEvent } from '@health-advisor/sandbox';
import {
  recognizeEvents,
  computeDerivedTemporalStates,
  loadManifest,
  generateHistory,
  PROFILE_CONFIGS,
  generateTimelineScript,
} from '@health-advisor/sandbox';
import type {
  ActiveSensingState,
  ActivitySegmentType,
  CloneProfilePayload,
  EventInjectPayload,
  GodModeStateResponse,
  MetricOverridePayload,
  ResetPayload,
  UpdateProfilePayload,
} from '@health-advisor/shared';
import { localize, DEFAULT_LOCALE } from '@health-advisor/shared';

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
        activeSensing: this.deriveActiveSensing(profileId),
      // 时间轴同步状态字段
      currentDemoTime: clock.currentTime,
      lastSyncTime: syncState.lastSyncedMeasuredAt,
      pendingEventCount: pendingEvents.length,
      recentRecognizedEvents: recognizedEvents,
      recentDerivedStates: derivedStates,
      availableProfiles: [...this.registry.profiles.values()].map((p) => ({
        profileId: p.profile.profileId,
        name: localize(p.profile.name, DEFAULT_LOCALE),
      })),
    };
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

  /** 一键校准演示数据：以当前真实日期为演示日，重新生成 31 天历史数据 */
  recalibrate(sessionId?: string): GodModeStateResponse {
    const today = new Date();
    const endDate = today.toISOString().slice(0, 10);
    const startDateObj = new Date(today);
    startDateObj.setDate(startDateObj.getDate() - 30);
    const startDate = startDateObj.toISOString().slice(0, 10);

    const dataDir = this.registry.config.dataDir;
    const manifest = loadManifest(dataDir);

    // 各 profile 的早间时间偏移
    const demoTimeOffsets: Record<string, { hour: number; min: number }> = {
      'profile-a': { hour: 7, min: 5 },
      'profile-b': { hour: 7, min: 30 },
      'profile-c': { hour: 6, min: 45 },
      'profile-d': { hour: 7, min: 15 },
    };

    for (const entry of manifest.profiles) {
      const config = PROFILE_CONFIGS[entry.profileId];
      if (!config) continue;

      // 1. 生成并写入 history
      const history = generateHistory(config, startDate, endDate);
      const historyPath = join(dataDir, 'history', `${entry.profileId}-daily-records.json`);
      writeFileSync(historyPath, JSON.stringify(history, null, 2) + '\n', 'utf-8');

      // 2. 更新 profile 的 initialDemoTime
      const offset = demoTimeOffsets[entry.profileId] ?? { hour: 7, min: 0 };
      const initialDemoTime = `${endDate}T${String(offset.hour).padStart(2, '0')}:${String(offset.min).padStart(2, '0')}`;

      const profilePath = join(dataDir, entry.file);
      const profileData = JSON.parse(readFileSync(profilePath, 'utf-8'));
      profileData.initialDemoTime = initialDemoTime;
      writeFileSync(profilePath, JSON.stringify(profileData, null, 2) + '\n', 'utf-8');

      // 3. 生成并写入 timeline script
      const script = generateTimelineScript(entry.profileId, endDate, initialDemoTime);
      const scriptPath = join(dataDir, 'timeline-scripts', `${entry.profileId}-day-1.json`);
      writeFileSync(scriptPath, JSON.stringify(script, null, 2) + '\n', 'utf-8');
    }

    // 4. 重新加载内存中的 profile 数据
    this.registry.reloadProfiles();

    // 5. 清空所有 demo state、session 和 analytical memory
    this.registry.overrideStore.reset('all');
    this.registry.sessionStore.clearAll();
    this.registry.analyticalMemory.clearAll();

    // 6. 对每个 profile 执行初始同步，使 timeline script 中的 baseline 事件变为已同步
    // 否则日级别查询会因当前日无 synced events 而返回空数据
    for (const entry of manifest.profiles) {
      this.registry.overrideStore.performSync(entry.profileId, 'manual_refresh');
    }

    this.invalidateSessionAnalytical(sessionId);
    return this.getState();
  }

  /** 更新 profile 字段（局部更新） */
  updateProfile(profileId: string, changes: UpdateProfilePayload) {
    return this.registry.profileManager.updateProfile(profileId, changes);
  }

  /** 克隆创建新 profile */
  cloneProfile(sourceProfileId: string, newProfileId: string, overrides?: CloneProfilePayload['overrides']) {
    return this.registry.profileManager.cloneProfile(sourceProfileId, newProfileId, overrides);
  }

  /** 删除 profile */
  deleteProfile(profileId: string) {
    const currentProfileId = this.registry.overrideStore.getCurrentProfileId();
    this.registry.profileManager.deleteProfile(profileId);

    // 如果删除的是当前活跃 profile，切换到第一个可用 profile
    if (currentProfileId === profileId) {
      const remaining = [...this.registry.profiles.keys()];
      if (remaining.length > 0) {
        this.registry.overrideStore.switchProfile(remaining[0]!);
      }
    }

    return { deletedProfileId: profileId };
  }

  /** 恢复 profile 到原始模板 */
  resetProfile(profileId: string) {
    return this.registry.profileManager.resetProfile(profileId);
  }

  /** 数据变更后失效 session 的 analytical memory，防止 AI 请求用过期上下文 */
  private invalidateSessionAnalytical(sessionId?: string): void {
    if (!sessionId) return;
    // 完整清空（含 latestHomepageBrief），因为 God-Mode 变更底层数据后所有缓存摘要均失效
    this.registry.analyticalMemory.invalidateOnProfileSwitch(sessionId);
  }
}
