import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import type { ProfileData, BaselineMetrics, DailyRecord } from '@health-advisor/shared';
import type { AgentRuntimeDeps } from '@health-advisor/agent-core';
import type { TimelineSyncContext } from '@health-advisor/agent-core';
import {
  initializeAgent,
  initializeAgents,
  resolveProviderConfig,
  resolveAllLlmConfigs,
  FakeChatModel,
  createFallbackEngine,
  createPromptLoader,
  InMemoryAnalyticalMemoryStore,
  createHealthAgent,
  SyncReflectionReviewer,
  ReflectionObserver,
  queryMetricSummaryTool,
  queryVisibleChartFactsTool,
  queryMissingDataTool,
  queryTimelineEventsTool,
  estimateCaffeineSleepImpactTool,
} from '@health-advisor/agent-core';
import type {
  PlanBuilderDeps,
  ReActLoopDeps,
  ToolDefinition,
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
  mergeCurrentDayRecord,
} from '@health-advisor/sandbox';
import type { AppConfig } from '../config/env.js';
import { createSessionStore, type SessionStoreService } from './session-store.js';
import { createOverrideStore, type OverrideStoreService } from './override-store.js';

import { ProfileManager } from '../modules/god-mode/profile-manager.js';
import type { MetricsStore } from '../plugins/metrics.js';

/**
 * 用 dailyBaseline 精确值填充记录中缺失的字段。
 * 仅当字段不存在（null/undefined）时才填充，避免覆盖已观测数据。
 */
function patchMissingRecordFieldsWithDailyBaseline(
  record: DailyRecord,
  dailyBaseline: Partial<BaselineMetrics>,
  demoTime?: string,
): DailyRecord {
  const patched = { ...record };

  if (dailyBaseline.avgSleepMinutes != null && !record.sleep) {
    const exact = dailyBaseline.avgSleepMinutes;
    let wakeHour = 6;
    let wakeMin = 0;
    if (demoTime) {
      const timePart = demoTime.split('T')[1];
      if (timePart) {
        const [h, m] = timePart.split(':');
        wakeHour = parseInt(h!, 10);
        wakeMin = parseInt(m!, 10);
      }
    }
    const wakeTotalMin = wakeHour * 60 + wakeMin;
    let bedTotalMin = wakeTotalMin - exact;
    if (bedTotalMin < 0) bedTotalMin += 24 * 60;
    const deep = Math.round(exact * 0.22);
    const rem = Math.round(exact * 0.24);
    const awake = Math.max(1, Math.round(exact * 0.06));
    const light = Math.max(0, exact - deep - rem - awake);

    patched.sleep = {
      totalMinutes: exact,
      stages: { deep, light, rem, awake },
      score: Math.max(5, Math.min(98, Math.round((exact / 480) * 90))),
      startTime: `${String(Math.floor(bedTotalMin / 60) % 24).padStart(2, '0')}:${String(bedTotalMin % 60).padStart(2, '0')}`,
      endTime: `${String(wakeHour).padStart(2, '0')}:${String(wakeMin).padStart(2, '0')}`,
    };
  }

  if (dailyBaseline.hrv != null && record.hrv == null) patched.hrv = dailyBaseline.hrv;
  if (dailyBaseline.spo2 != null && record.spo2 == null) patched.spo2 = dailyBaseline.spo2;

  if (dailyBaseline.restingHr != null && (!record.hr || record.hr.length === 0)) {
    patched.hr = [dailyBaseline.restingHr];
  }

  if (dailyBaseline.avgSteps != null && !record.activity) {
    patched.activity = {
      steps: dailyBaseline.avgSteps,
      calories: Math.round(dailyBaseline.avgSteps * 0.04),
      activeMinutes: 0,
      distanceKm: Math.round(dailyBaseline.avgSteps * 0.0007 * 100) / 100,
    };
  }

  return patched;
}

export interface RuntimeRegistry extends AgentRuntimeDeps {
  config: AppConfig;
  metrics: MetricsStore;
  sessionStore: SessionStoreService;
  overrideStore: OverrideStoreService;
  profiles: Map<string, ProfileData>;
  profileManager: ProfileManager;
  /** 不含 override 的原始 profile 数据 */
  getRawProfile(profileId: string): ProfileData;
  /** 重新从磁盘加载所有 profile 数据 */
  reloadProfiles(): void;
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

  // 4. 创建 prompt loader 和 fallback engine
  const promptLoader = createPromptLoader(undefined, join(config.dataDir, 'prompts'));
  const fallbackEngine = createFallbackEngine({}, join(config.dataDir, 'fallbacks'));

  // 6. 创建 agent（支持多角色配置）
  // H-4: fallback 模式下使用 FakeChatModel 避免创建真实 API 连接
  const providerEnv = toProviderEnv(config);
  const agent = config.FALLBACK_ONLY_MODE
    ? createHealthAgent({ chatModel: new FakeChatModel('{"summary":"fallback","chartTokens":[],"microTips":[]}') })
    : undefined;
  const agents = config.FALLBACK_ONLY_MODE
    ? undefined
    : initializeAgents(resolveAllLlmConfigs(providerEnv));
  const effectiveAgent = agent ?? agents!.solverAgent;

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

    // 保留当前活动日的完整历史记录，用于补充聚合数据
    const historicalCurrentDay = overriddenRecords.find(
      (r) => r.date === currentDate,
    );

    // 从 records 中排除当前活动日的完整历史记录
    const historicalRecords = overriddenRecords.filter(
      (r) => r.date !== currentDate,
    );

    // 获取已同步事件，聚合当前日记录
    const syncedEvents = overrideStore.getSyncedEvents(profileId);
    if (syncedEvents.length > 0) {
      const aggregatedRecord = aggregateCurrentDayRecord(syncedEvents, clock.currentTime);
      let currentDayRecord = mergeCurrentDayRecord(historicalCurrentDay, aggregatedRecord);

      // 用 dailyBaseline 精确值填充聚合数据中缺失的字段（不覆盖已观测数据）
      if (raw.profile.dailyBaseline) {
        currentDayRecord = patchMissingRecordFieldsWithDailyBaseline(currentDayRecord, raw.profile.dailyBaseline, clock.currentTime);
      }

      return { ...raw, records: [...historicalRecords, currentDayRecord] };
    }

    // 无已同步事件但有历史记录：使用历史记录兜底
    if (historicalCurrentDay) {
      return { ...raw, records: [...historicalRecords, historicalCurrentDay] };
    }

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
      syncedEvents,
      derivedTemporalStates,
      syncMetadata: {
        lastSyncedMeasuredAt: syncState.lastSyncedMeasuredAt,
        pendingEventCount: pendingEvents.length,
      },
    };
  }

  function reloadProfiles(): void {
    // H-7: 先构建新 Map，再一次性替换（原子操作），避免并发读到空/不完整 profiles
    const newProfiles = loadAllProfiles(config.dataDir);
    profiles.clear();
    for (const [key, value] of newProfiles) {
      profiles.set(key, value);
    }
  }

  const profileManager = new ProfileManager({
    dataDir: config.dataDir,
    reloadProfiles,
  });

  // C-1: 构建 P0/P1/P2/P3 依赖（仅非 fallback 模式）
  let planBuilder: PlanBuilderDeps | undefined;
  let reactLoop: ReActLoopDeps | undefined;
  let syncReviewer: SyncReflectionReviewer | undefined;
  let reflectionObserver: ReflectionObserver | undefined;

  if (!config.FALLBACK_ONLY_MODE) {
    const plannerPrompt = loadPromptFile(
      join(config.dataDir, 'prompts', 'advisor-plan.md'),
    );

    planBuilder = {
      plannerAgent: agents!.plannerAgent,
      plannerPrompt,
    };

    const reactTools = new Map<string, ToolDefinition<unknown, unknown>>();
    reactTools.set(queryMetricSummaryTool.name, queryMetricSummaryTool as ToolDefinition<unknown, unknown>);
    reactTools.set(queryVisibleChartFactsTool.name, queryVisibleChartFactsTool as ToolDefinition<unknown, unknown>);
    reactTools.set(queryMissingDataTool.name, queryMissingDataTool as ToolDefinition<unknown, unknown>);
    reactTools.set(queryTimelineEventsTool.name, queryTimelineEventsTool as ToolDefinition<unknown, unknown>);
    reactTools.set(estimateCaffeineSleepImpactTool.name, estimateCaffeineSleepImpactTool as ToolDefinition<unknown, unknown>);

    reactLoop = {
      plannerAgent: agents!.plannerAgent,
      tools: reactTools,
      reactPrompt: loadPromptFile(join(config.dataDir, 'prompts', 'react-tool-select.md')),
    };

    syncReviewer = new SyncReflectionReviewer({
      reviewerAgent: agents!.reviewerAgent,
      gatePrompt: loadPromptFile(join(config.dataDir, 'prompts', 'sync-gate.md')),
    });

    // C-1: 注入 P0 异步 ReflectionObserver
    reflectionObserver = new ReflectionObserver({
      reviewerAgent: agents!.reviewerAgent,
      reviewerPrompt: loadPromptFile(join(config.dataDir, 'prompts', 'reflection-reviewer.md')),
      reviewerModelName: config.REVIEWER_LLM_MODEL || config.LLM_MODEL,
    });
  }

  return {
    config,
    metrics,
    sessionStore,
    overrideStore,
    profiles,
    profileManager,
    getRawProfile,
    reloadProfiles,

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
    getDemoNow: (profileId: string) => {
      try { return overrideStore.getDemoClock(profileId).currentTime; }
      catch { return undefined; }
    },

    // AgentRuntimeDeps 自己的字段
    agent: effectiveAgent,
    promptLoader,
    fallbackEngine,

    // C-1: P0/P1/P2/P3 依赖注入
    planBuilder,
    reactLoop,
    syncReviewer,
    reflectionObserver,
  };
}

export function toProviderEnv(config: AppConfig): Record<string, string> {
  const env: Record<string, string> = {
    LLM_PROVIDER: config.LLM_PROVIDER,
    LLM_MODEL: config.LLM_MODEL,
    LLM_API_KEY: config.LLM_API_KEY,
    LLM_BASE_URL: config.LLM_BASE_URL,
    LLM_TIMEOUT_MS: String(config.LLM_TIMEOUT_MS),
  };

  // 全局可选配置（有值时才传递，避免覆盖角色默认值）
  if (config.LLM_TEMPERATURE != null) env.LLM_TEMPERATURE = String(config.LLM_TEMPERATURE);
  if (config.LLM_MAX_RETRIES != null) env.LLM_MAX_RETRIES = String(config.LLM_MAX_RETRIES);

  // Planner 角色独立配置
  if (config.PLANNER_LLM_PROVIDER) env.PLANNER_LLM_PROVIDER = config.PLANNER_LLM_PROVIDER;
  if (config.PLANNER_LLM_MODEL) env.PLANNER_LLM_MODEL = config.PLANNER_LLM_MODEL;
  if (config.PLANNER_LLM_API_KEY) env.PLANNER_LLM_API_KEY = config.PLANNER_LLM_API_KEY;
  if (config.PLANNER_LLM_BASE_URL) env.PLANNER_LLM_BASE_URL = config.PLANNER_LLM_BASE_URL;
  if (config.PLANNER_LLM_TEMPERATURE != null) env.PLANNER_LLM_TEMPERATURE = String(config.PLANNER_LLM_TEMPERATURE);
  if (config.PLANNER_LLM_TIMEOUT_MS != null) env.PLANNER_LLM_TIMEOUT_MS = String(config.PLANNER_LLM_TIMEOUT_MS);
  if (config.PLANNER_LLM_MAX_RETRIES != null) env.PLANNER_LLM_MAX_RETRIES = String(config.PLANNER_LLM_MAX_RETRIES);

  // Reviewer 角色独立配置
  if (config.REVIEWER_LLM_PROVIDER) env.REVIEWER_LLM_PROVIDER = config.REVIEWER_LLM_PROVIDER;
  if (config.REVIEWER_LLM_MODEL) env.REVIEWER_LLM_MODEL = config.REVIEWER_LLM_MODEL;
  if (config.REVIEWER_LLM_API_KEY) env.REVIEWER_LLM_API_KEY = config.REVIEWER_LLM_API_KEY;
  if (config.REVIEWER_LLM_BASE_URL) env.REVIEWER_LLM_BASE_URL = config.REVIEWER_LLM_BASE_URL;
  if (config.REVIEWER_LLM_TEMPERATURE != null) env.REVIEWER_LLM_TEMPERATURE = String(config.REVIEWER_LLM_TEMPERATURE);
  if (config.REVIEWER_LLM_TIMEOUT_MS != null) env.REVIEWER_LLM_TIMEOUT_MS = String(config.REVIEWER_LLM_TIMEOUT_MS);
  if (config.REVIEWER_LLM_MAX_RETRIES != null) env.REVIEWER_LLM_MAX_RETRIES = String(config.REVIEWER_LLM_MAX_RETRIES);

  return env;
}

/** 从文件加载 prompt 文本，文件不存在时抛出明确错误 */
function loadPromptFile(filePath: string): string {
  if (!existsSync(filePath)) {
    throw new Error(`Prompt 文件不存在: ${filePath}`);
  }
  return readFileSync(filePath, 'utf-8');
}
