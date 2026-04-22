import { join } from 'node:path';
import type { ProfileData } from '@health-advisor/shared';
import type { AgentRuntimeDeps } from '@health-advisor/agent-core';
import type { TimelineSyncContext } from '@health-advisor/agent-core';
import {
  initializeAgent,
  resolveProviderConfig,
  FakeChatModel,
  createFallbackEngine,
  createPromptLoader,
  InMemoryAnalyticalMemoryStore,
  createHealthAgent,
} from '@health-advisor/agent-core';
import {
  loadAllProfiles,
  getProfile as sandboxGetProfile,
  selectByTimeframe,
  applyOverrides,
  mergeEvents,
  recognizeEvents,
  computeDerivedTemporalStates,
  aggregateCurrentDayRecord,
} from '@health-advisor/sandbox';
import type { AppConfig } from '../config/env.js';
import { createSessionStore, type SessionStoreService } from './session-store.js';
import { createOverrideStore, type OverrideStoreService } from './override-store.js';
import { createScenarioRegistry, type ScenarioRegistryService } from './scenario-registry.js';
import type { MetricsStore } from '../plugins/metrics.js';

export interface RuntimeRegistry extends AgentRuntimeDeps {
  config: AppConfig;
  metrics: MetricsStore;
  sessionStore: SessionStoreService;
  overrideStore: OverrideStoreService;
  scenarioRegistry: ScenarioRegistryService;
  profiles: Map<string, ProfileData>;
  /** 不含 override 的原始 profile 数据 */
  getRawProfile(profileId: string): ProfileData;
}

export function createRuntimeRegistry(
  config: AppConfig,
  metrics: MetricsStore,
): RuntimeRegistry {
  // 1. 加载 sandbox profiles
  const profiles = loadAllProfiles(config.dataDir);

  // 2. 创建 session / analytical memory
  const sessionStore = createSessionStore();
  const analyticalMemory = new InMemoryAnalyticalMemoryStore();

  // 3. 创建 override store（支持 timeline sync 的 demo-state-store）
  const defaultProfileId = [...profiles.keys()][0] ?? 'profile-a';
  const overrideStore = createOverrideStore(defaultProfileId, {
    dataDir: config.dataDir,
  });

  // 4. 创建 scenario registry
  const scenarioRegistry = createScenarioRegistry(config.dataDir);

  // 5. 创建 prompt loader 和 fallback engine
  const promptLoader = createPromptLoader(undefined, join(config.dataDir, 'prompts'));
  const fallbackEngine = createFallbackEngine({}, join(config.dataDir, 'fallbacks'));

  // 6. 创建 agent
  const agent = config.FALLBACK_ONLY_MODE
    ? createHealthAgent({ chatModel: new FakeChatModel('{"summary":"fallback","chartTokens":[],"microTips":[]}') })
    : initializeAgent(resolveProviderConfig(toProviderEnv(config)));

  // 7. getProfile 中间层：应用 override，并正确处理当前活动日
  function getProfileWithOverrides(profileId: string): ProfileData {
    const raw = sandboxGetProfile(profiles, profileId);
    const overrides = overrideStore.getActiveOverrides(profileId);

    // 先应用 override
    const overriddenRecords = overrides.length > 0
      ? applyOverrides(raw.records, overrides)
      : raw.records;

    // 检查是否处于 demo timeline 模式，需要替换当前活动日
    // 如果 timeline state 初始化失败（如缺少 V2 配置），降级为普通模式
    let clock: ReturnType<typeof overrideStore.getDemoClock> | null = null;
    try {
      clock = overrideStore.getDemoClock(profileId);
    } catch {
      // V1 profile 不支持 timeline mode，直接使用 override 后的 records
      return { ...raw, records: overriddenRecords };
    }

    if (!clock.currentTime) {
      // 非 demo 模式，直接返回 override 后的 records
      return { ...raw, records: overriddenRecords };
    }

    const currentDate = clock.currentTime.slice(0, 10);
    // 从 records 中排除当前活动日的完整历史记录
    const historicalRecords = overriddenRecords.filter(
      (r) => r.date !== currentDate,
    );

    // 获取已同步事件，聚合当前日记录
    const syncedEvents = overrideStore.getSyncedEvents(profileId);
    if (syncedEvents.length > 0) {
      const currentDayRecord = aggregateCurrentDayRecord(syncedEvents, clock.currentTime);
      return { ...raw, records: [...historicalRecords, currentDayRecord] };
    }

    // 无已同步事件：当前日为空
    return { ...raw, records: historicalRecords };
  }

  function getRawProfile(profileId: string): ProfileData {
    return sandboxGetProfile(profiles, profileId);
  }

  /** 获取时间轴同步上下文（识别事件 + 派生状态 + 同步元数据） */
  function getTimelineSync(profileId: string): TimelineSyncContext | undefined {
    let clock: ReturnType<typeof overrideStore.getDemoClock> | null = null;
    try {
      clock = overrideStore.getDemoClock(profileId);
    } catch {
      // V1 profile 不支持 timeline mode
      return undefined;
    }

    if (!clock.currentTime) {
      // 非 demo 模式，不提供 timeline sync 上下文
      return undefined;
    }

    const syncedEvents = overrideStore.getSyncedEvents(profileId);
    const syncState = overrideStore.getSyncState(profileId);
    const pendingEvents = overrideStore.getPendingEvents(profileId);

    // 从已同步事件计算识别结果
    const recognizedEvents = recognizeEvents(syncedEvents, profileId, clock.currentTime);
    // 从识别结果计算派生状态
    const derivedTemporalStates = computeDerivedTemporalStates(recognizedEvents, clock.currentTime, profileId);

    return {
      recognizedEvents,
      derivedTemporalStates,
      syncMetadata: {
        lastSyncedMeasuredAt: syncState.lastSyncedMeasuredAt,
        pendingEventCount: pendingEvents.length,
      },
    };
  }

  return {
    config,
    metrics,
    sessionStore,
    overrideStore,
    scenarioRegistry,
    profiles,
    getRawProfile,

    // AgentRuntimeDeps (extends ContextBuilderDeps)
    getProfile: getProfileWithOverrides,
    selectByTimeframe,
    applyOverrides,
    mergeEvents,
    sessionMemory: sessionStore.store,
    analyticalMemory,
    getActiveOverrides: (profileId: string) => overrideStore.getActiveOverrides(profileId),
    getInjectedEvents: (profileId: string) => overrideStore.getInjectedEvents(profileId),
    getTimelineSync,

    // AgentRuntimeDeps 自己的字段
    agent,
    promptLoader,
    fallbackEngine,
  };
}

export function toProviderEnv(config: AppConfig): Record<string, string> {
  return {
    LLM_PROVIDER: config.LLM_PROVIDER,
    LLM_MODEL: config.LLM_MODEL,
    LLM_API_KEY: config.LLM_API_KEY,
    LLM_BASE_URL: config.LLM_BASE_URL,
    LLM_TEMPERATURE: String(config.LLM_TEMPERATURE),
    LLM_MAX_RETRIES: String(config.LLM_MAX_RETRIES),
    LLM_TIMEOUT_MS: String(config.LLM_TIMEOUT_MS),
  };
}
