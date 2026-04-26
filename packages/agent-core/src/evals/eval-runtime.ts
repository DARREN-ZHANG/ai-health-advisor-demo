/**
 * Eval Runtime Factory：为评测创建隔离的 AgentRuntimeDeps。
 *
 * 组装 sandbox 和 agent-core 内部模块，根据 AgentEvalCase 的 setup
 * 写入初始状态（memory / overrides / events / timeline），返回可直接
 * 传给 executeAgent 的运行时依赖。
 */

import type { AgentEvalCase, EvalProviderMode } from './types';
import type { AgentRuntimeDeps } from '../runtime/agent-runtime';
import type { TimelineSyncContext } from '../types/agent-context';
import type { OverrideEntry, DatedEvent } from '@health-advisor/sandbox';
import type { SyncState } from '@health-advisor/sandbox';
import type { ProfileData, DailyRecord, DeviceEvent } from '@health-advisor/shared';
import type { FallbackAssets } from '../fallback/fallback-engine';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

// sandbox 模块
import {
  loadAllProfiles,
  getProfile as sandboxGetProfile,
  selectByTimeframe,
  applyOverrides,
  mergeEvents,
  buildInitialProfileState,
  appendSegment,
  createSyncState,
  addEventsToSyncState,
  performSync,
  getSyncedEvents,
  getPendingEvents,
  recognizeEvents,
  computeDerivedTemporalStates,
} from '@health-advisor/sandbox';

// agent-core 内部模块
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { InMemorySessionMemoryStore } from '../memory/session-memory-store';
import { InMemoryAnalyticalMemoryStore } from '../memory/analytical-memory-store';
import { createPromptLoader, type PromptLoader, type PromptName } from '../prompts/prompt-loader';
import { createFallbackEngine, type FallbackEngine } from '../fallback/fallback-engine';
import { createHealthAgent } from '../executor/create-agent';
import { FakeChatModel } from '../provider/fake-chat-model';

// ── 默认 fake LLM 输出 ──────────────────────────────

const DEFAULT_FAKE_OUTPUT = JSON.stringify({
  source: 'llm',
  statusColor: 'good',
  summary: '整体状态稳定，当前数据未显示明显异常，建议维持现有作息并继续观察趋势。',
  chartTokens: [],
  microTips: [],
});

// ── 最小 FallbackAssets（无 dataDir 时的降级） ─────────

const MINIMAL_FALLBACK_ASSETS: FallbackAssets = {
  homepage: {},
  'view-summary': {},
  'advisor-chat': {},
};

// ── 最小 ProfileData（加载失败时使用） ───────────────

function makeMinimalProfile(profileId: string): ProfileData {
  return {
    profile: {
      profileId,
      name: '测试用户',
      age: 30,
      gender: 'male',
      avatar: '',
      tags: [],
      baseline: {
        restingHr: 60,
        hrv: 50,
        spo2: 97,
        avgSleepMinutes: 420,
        avgSteps: 8000,
      },
    },
    records: generateMinimalRecords(),
  };
}

/** 生成 7 天最小 DailyRecord（满足 LOW_DATA_THRESHOLD） */
function generateMinimalRecords(): DailyRecord[] {
  const records: DailyRecord[] = [];
  for (let i = 0; i < 7; i++) {
    const day = String(18 + i).padStart(2, '0');
    records.push({
      date: `2026-04-${day}`,
      hr: [60, 62],
      hrv: 50,
      sleep: {
        totalMinutes: 420,
        startTime: '23:00',
        endTime: '06:00',
        stages: { deep: 90, light: 180, rem: 120, awake: 30 },
        score: 80,
      },
      activity: { steps: 8000, calories: 2000, activeMinutes: 30, distanceKm: 4.0 },
      spo2: 97,
      stress: { load: 30 },
    });
  }
  return records;
}

// ── 公共接口 ────────────────────────────────────────

export interface CreateEvalRuntimeOptions {
  evalCase: AgentEvalCase;
  dataDir?: string;
  providerMode: EvalProviderMode;
}

/**
 * 创建隔离的 eval runtime deps。
 *
 * 根据 case 的 setup 注入 memory、overrides、events、timeline 状态，
 * 返回可直接传给 executeAgent 的 AgentRuntimeDeps。
 */
export function createEvalRuntime(
  options: CreateEvalRuntimeOptions,
): AgentRuntimeDeps {
  const { evalCase, dataDir, providerMode } = options;
  const { setup } = evalCase;
  const profileId = setup.profileId;

  // ── 1. 加载 profile ─────────────────────────────
  const profiles = loadProfilesSafe(dataDir);
  const profileData = getProfileSafe(profiles, profileId);

  // ── 2. 创建 memory store 并 seed ─────────────────
  const sessionMemory = new InMemorySessionMemoryStore();
  const analyticalMemory = new InMemoryAnalyticalMemoryStore();
  seedMemory(sessionMemory, analyticalMemory, setup);

  // ── 3. 准备 overrides ────────────────────────────
  const overrideEntries: OverrideEntry[] = (setup.overrides ?? []).map((o) => ({
    metric: o.metric,
    value: o.value,
    dateRange: o.dateRange,
  }));

  // ── 4. 准备 injected events ──────────────────────
  const injectedEvents: DatedEvent[] = (setup.injectedEvents ?? []).map((e) => ({
    date: e.date,
    type: e.type,
    data: e.data ?? {},
  }));

  // ── 5. 构建 timeline state（可选） ───────────────
  const timelineState = buildTimelineState(dataDir, profileId, setup.timeline);

  // ── 6. 创建 agent ───────────────────────────────
  const agent = createEvalAgent(setup.modelFixture, providerMode);

  // ── 7. 创建 prompt loader 和 fallback engine ────
  const promptLoader = createPromptLoaderWithFallback(dataDir);
  const fallbackEngine = createFallbackEngineForEval(dataDir);

  // ── 8. 组装 deps ─────────────────────────────────
  const deps: AgentRuntimeDeps = {
    getProfile: (_pid: string) =>
      _pid === profileId ? profileData : getProfileSafe(profiles, _pid),

    selectByTimeframe: (
      records: DailyRecord[],
      timeframe: Parameters<typeof selectByTimeframe>[1],
      opts?: Parameters<typeof selectByTimeframe>[2],
    ) => selectByTimeframe(records, timeframe, opts),

    applyOverrides: (
      records: DailyRecord[],
      overrides: OverrideEntry[],
    ) => applyOverrides(records, overrides),

    mergeEvents: (
      baseEvents: DatedEvent[],
      injected: DatedEvent[],
    ) => mergeEvents(baseEvents, injected),

    sessionMemory,
    analyticalMemory,

    getActiveOverrides: (_pid: string) =>
      _pid === profileId ? overrideEntries : [],

    getInjectedEvents: (_pid: string) =>
      _pid === profileId ? injectedEvents : [],

    // timeline 同步上下文
    getTimelineSync: timelineState
      ? (pid: string) => {
          if (pid !== profileId || !timelineState) return undefined;
          return buildTimelineSyncContext(timelineState);
        }
      : undefined,

    agent,
    promptLoader,
    fallbackEngine,
  };

  return deps;
}

// ── 内部辅助函数 ────────────────────────────────────

/** 安全加载 profiles，失败时返回空 Map */
function loadProfilesSafe(dataDir?: string): Map<string, ProfileData> {
  if (!dataDir) return new Map();
  try {
    return loadAllProfiles(dataDir);
  } catch {
    return new Map();
  }
}

/** 安全获取 profile，找不到时返回最小 mock */
function getProfileSafe(
  profiles: Map<string, ProfileData>,
  profileId: string,
): ProfileData {
  try {
    return sandboxGetProfile(profiles, profileId);
  } catch {
    return makeMinimalProfile(profileId);
  }
}

/** 写入初始 memory 状态 */
function seedMemory(
  sessionMemory: InMemorySessionMemoryStore,
  analyticalMemory: InMemoryAnalyticalMemoryStore,
  setup: AgentEvalCase['setup'],
): void {
  const sessionId = 'eval-session';
  const profileId = setup.profileId;

  // seed session messages
  const messages = setup.memory?.sessionMessages ?? [];
  for (const msg of messages) {
    sessionMemory.appendMessage(sessionId, profileId, {
      role: msg.role,
      text: msg.text,
      createdAt: msg.createdAt ?? Date.now(),
    });
  }

  // seed analytical memory
  const analytical = setup.memory?.analytical;
  if (analytical) {
    if (analytical.latestHomepageBrief) {
      analyticalMemory.setHomepageBrief(
        sessionId,
        profileId,
        analytical.latestHomepageBrief,
      );
    }
    if (analytical.latestViewSummaryByScope) {
      for (const [scope, summary] of Object.entries(analytical.latestViewSummaryByScope)) {
        analyticalMemory.setViewSummary(sessionId, profileId, scope, summary);
      }
    }
    if (analytical.latestRuleSummary) {
      analyticalMemory.setRuleSummary(sessionId, profileId, analytical.latestRuleSummary);
    }
  }
}

/** 创建 eval agent：fake 模式用 FakeChatModel，real 模式用真实 provider */
function createEvalAgent(
  fixture: AgentEvalCase['setup']['modelFixture'],
  providerMode: EvalProviderMode,
): import('../executor/create-agent').HealthAgent {
  if (providerMode === 'real') {
    const chatModel = createRealChatModel();
    return createHealthAgent({ chatModel });
  }
  const modelResponse = resolveFakeModelResponse(fixture);
  const fakeModel = new FakeChatModel(modelResponse);
  return createHealthAgent({ chatModel: fakeModel });
}

/** 创建真实 provider chat model，从环境变量读取配置 */
function createRealChatModel(): BaseChatModel {
  const { resolveProviderConfig } = require('../provider/provider-config') as typeof import('../provider/provider-config');
  const { createChatModel } = require('../provider/model-factory') as typeof import('../provider/model-factory');
  const config = resolveProviderConfig(process.env as Record<string, string | undefined>);
  if (!config.apiKey) {
    throw new Error(
      '真实 provider 模式需要配置 LLM_API_KEY 环境变量。' +
      '请设置 LLM_API_KEY、LLM_PROVIDER（可选）后重试，或使用 --provider fake。',
    );
  }
  return createChatModel(config);
}

/** 创建 fallback engine：有 dataDir 时尝试加载真实 fallback assets，否则使用最小降级 */
function createFallbackEngineForEval(dataDir: string | undefined): FallbackEngine {
  if (!dataDir) {
    return createFallbackEngine(MINIMAL_FALLBACK_ASSETS);
  }
  const fallbacksDir = join(dataDir, 'fallbacks');
  try {
    return createFallbackEngine({ readFile: (path, enc) => readFileSync(path, (enc ?? 'utf-8') as BufferEncoding) as string }, fallbacksDir);
  } catch {
    // 加载失败时降级到最小 assets
    return createFallbackEngine(MINIMAL_FALLBACK_ASSETS);
  }
}

/** 决定 fake model 的响应内容 */
function resolveFakeModelResponse(
  fixture: AgentEvalCase['setup']['modelFixture'],
): string {
  if (!fixture) return DEFAULT_FAKE_OUTPUT;

  switch (fixture.mode) {
    case 'fake-invalid-json':
      return fixture.content ?? '<<<这不是合法的JSON>>>';
    case 'fake-json':
      return fixture.content ?? DEFAULT_FAKE_OUTPUT;
    case 'real-provider':
      // real-provider fixture 在 fake 模式下回退到默认
      return DEFAULT_FAKE_OUTPUT;
    default:
      return DEFAULT_FAKE_OUTPUT;
  }
}

/** mock prompt loader 的默认模板 */
const MOCK_PROMPT_TEMPLATES: Record<string, string> = {
  system: '你是一位专业健康顾问。',
  homepage: '请生成首页摘要。',
  'view-summary': '请生成视图总结。',
  'advisor-chat': '请进行健康对话。',
};

/** 创建 mock prompt loader */
function createMockPromptLoader(): PromptLoader {
  return {
    load: (name: PromptName) => MOCK_PROMPT_TEMPLATES[name] ?? '',
    listAvailable: (): PromptName[] => ['system', 'homepage', 'view-summary', 'advisor-chat'],
  };
}

/**
 * 创建带 fallback 的 prompt loader。
 *
 * 尝试使用 dataDir 下的 prompts 目录加载模板文件。
 * 由于 PromptLoader 是延迟读取（load 时才读文件），
 * 需要在创建时主动探测文件可用性，失败则回退到 mock loader。
 */
function createPromptLoaderWithFallback(dataDir?: string): PromptLoader {
  if (!dataDir) {
    return createMockPromptLoader();
  }

  // 尝试基于 dataDir 构造 prompts 路径
  const promptsDir = join(dataDir, 'prompts');

  // 主动探测：尝试加载 system.md，成功则使用真实 loader
  try {
    const realLoader = createPromptLoader(undefined, promptsDir);
    // 探测 system prompt 是否可读
    realLoader.load('system');
    return realLoader;
  } catch {
    // prompts 目录不存在或文件不可读，使用 mock
    return createMockPromptLoader();
  }
}

// ── Timeline 状态管理 ───────────────────────────────

interface TimelineState {
  syncState: SyncState;
  currentTime: string;
}

/**
 * 根据 case setup 构建 timeline 同步状态。
 *
 * 流程：
 * 1. buildInitialProfileState 初始化 profile 的 demoClock、segments、baseline raw events
 * 2. 对 setup.timeline.appendSegments 逐条调用 sandbox appendSegment
 * 3. 根据 setup.timeline.performSync 执行同步
 */
function buildTimelineState(
  dataDir: string | undefined,
  profileId: string,
  timelineSetup: AgentEvalCase['setup']['timeline'],
): TimelineState | undefined {
  // 没有 timeline setup 就跳过
  if (!timelineSetup) return undefined;
  if (!timelineSetup.appendSegments?.length && !timelineSetup.performSync) {
    return undefined;
  }

  // 必须有 dataDir 才能构建 timeline
  if (!dataDir) return undefined;

  // 1. 初始化 profile 状态
  let initialState: ReturnType<typeof buildInitialProfileState>;
  try {
    initialState = buildInitialProfileState(dataDir, profileId);
  } catch {
    return undefined;
  }

  const initialDemoTime = initialState.demoClock.currentTime;
  let segments = initialState.segments;
  let currentTime = initialDemoTime;

  // 从初始 segments 中提取初始 events（如果有的话）
  // 注：buildInitialProfileState 不直接返回 raw events，
  // 我们只对 appendSegment 产生的新 events 做同步管理
  const syncState = createSyncState(profileId, []);

  let updatedSyncState = syncState;

  // 2. 逐条追加 segment
  if (timelineSetup.appendSegments) {
    for (const seg of timelineSetup.appendSegments) {
      const result = appendSegment(
        segments,
        currentTime,
        seg.segmentType as Parameters<typeof appendSegment>[2],
        profileId,
        seg.params,
        seg.offsetMinutes,
        {
          durationMinutes: seg.durationMinutes,
          advanceClock: seg.advanceClock,
        },
      );

      segments = result.segments;
      currentTime = result.newCurrentTime;

      // 将新产生的 events 追加到 sync state
      updatedSyncState = addEventsToSyncState(updatedSyncState, result.events);
    }
  }

  // 3. 根据 performSync 决定是否执行同步
  if (timelineSetup.performSync) {
    const syncResult = performSync(
      updatedSyncState,
      timelineSetup.performSync,
      currentTime,
    );
    updatedSyncState = syncResult.state;
  }

  return {
    syncState: updatedSyncState,
    currentTime,
  };
}

/** 从 TimelineState 构建 TimelineSyncContext */
function buildTimelineSyncContext(
  state: TimelineState,
): TimelineSyncContext {
  const { syncState, currentTime } = state;
  const profileId = syncState.profileId;

  // 获取已同步的事件
  const syncedEvents = getSyncedEvents(syncState);
  const pendingEvents = getPendingEvents(syncState);

  // 识别事件
  const recognizedEvents = recognizeEvents(syncedEvents, profileId, currentTime);

  // 计算派生状态
  const derivedTemporalStates = computeDerivedTemporalStates(
    recognizedEvents,
    currentTime,
    profileId,
  );

  return {
    recognizedEvents,
    derivedTemporalStates,
    syncMetadata: {
      lastSyncedMeasuredAt: syncState.lastSyncedMeasuredAt,
      pendingEventCount: pendingEvents.length,
    },
  };
}
