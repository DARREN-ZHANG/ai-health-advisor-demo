import { join } from 'node:path';
import type { ProfileData } from '@health-advisor/shared';
import type { AgentRuntimeDeps } from '@health-advisor/agent-core';
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

  // 7. getProfile 中间层：应用 override
  function getProfileWithOverrides(profileId: string): ProfileData {
    const raw = sandboxGetProfile(profiles, profileId);
    const overrides = overrideStore.getActiveOverrides(profileId);
    if (overrides.length === 0) return raw;
    return { ...raw, records: applyOverrides(raw.records, overrides) };
  }

  function getRawProfile(profileId: string): ProfileData {
    return sandboxGetProfile(profiles, profileId);
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
