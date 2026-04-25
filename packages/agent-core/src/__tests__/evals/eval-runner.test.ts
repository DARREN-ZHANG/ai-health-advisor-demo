import { describe, it, expect } from 'vitest';
import { createEvalRuntime } from '../../evals/eval-runtime';
import type { AgentEvalCase } from '../../evals/types';
import type { AgentRequest } from '../../types/agent-request';
import { AgentTaskType } from '@health-advisor/shared';
import { join } from 'node:path';

// ── 测试数据目录 ────────────────────────────────────

const DATA_DIR = join(process.cwd(), 'data', 'sandbox');

// ── 辅助函数 ────────────────────────────────────────

/** 创建最小 AgentEvalCase */
function makeEvalCase(
  overrides: Partial<AgentEvalCase> = {},
): AgentEvalCase {
  return {
    id: 'test-case-001',
    title: '测试用例',
    suite: 'smoke',
    category: 'homepage',
    priority: 'P0',
    tags: [],
    setup: {
      profileId: 'profile-a',
      ...overrides.setup,
    },
    request: makeRequest(),
    expectations: {},
    ...overrides,
  };
}

/** 创建最小 AgentRequest */
function makeRequest(overrides: Partial<AgentRequest> = {}): AgentRequest {
  return {
    requestId: 'req-eval-1',
    sessionId: 'eval-session',
    profileId: 'profile-a',
    taskType: AgentTaskType.HOMEPAGE_SUMMARY,
    pageContext: {
      profileId: 'profile-a',
      page: 'home',
      timeframe: 'week',
    },
    ...overrides,
  };
}

// ── 测试组 ──────────────────────────────────────────

describe('createEvalRuntime', () => {
  it('seed memory 后 context 能读取', () => {
    const evalCase = makeEvalCase({
      setup: {
        profileId: 'profile-a',
        memory: {
          sessionMessages: [
            { role: 'user', text: '最近睡眠怎么样？', createdAt: 1000 },
            { role: 'assistant', text: '你的睡眠质量不错。', createdAt: 1001 },
          ],
          analytical: {
            latestHomepageBrief: '上次首页简报内容',
            latestRuleSummary: '规则摘要内容',
          },
        },
      },
    });

    const deps = createEvalRuntime({
      evalCase,
      dataDir: DATA_DIR,
      providerMode: 'fake',
    });

    // 验证 session memory 可读取
    const messages = deps.sessionMemory.getRecentMessages('eval-session');
    expect(messages.length).toBe(2);
    expect(messages[0]!.role).toBe('user');
    expect(messages[0]!.text).toBe('最近睡眠怎么样？');
    expect(messages[1]!.role).toBe('assistant');
    expect(messages[1]!.text).toBe('你的睡眠质量不错。');

    // 验证 analytical memory 可读取
    const analytical = deps.analyticalMemory.get('eval-session');
    expect(analytical).toBeDefined();
    expect(analytical!.latestHomepageBrief).toBe('上次首页简报内容');
    expect(analytical!.latestRuleSummary).toBe('规则摘要内容');
  });

  it('fake invalid JSON 可触发 fallback', async () => {
    const evalCase = makeEvalCase({
      setup: {
        profileId: 'profile-a',
        modelFixture: {
          mode: 'fake-invalid-json',
          content: '<<<invalid>>>',
        },
      },
    });

    const deps = createEvalRuntime({
      evalCase,
      dataDir: DATA_DIR,
      providerMode: 'fake',
    });

    // agent 应返回 invalid JSON
    const result = await deps.agent.invoke({
      systemPrompt: 'test',
      userPrompt: 'test',
    });
    expect(result.content).toBe('<<<invalid>>>');
  });

  it('overrides 注入后 getProfile 读取到更新数据', () => {
    const evalCase = makeEvalCase({
      setup: {
        profileId: 'profile-a',
        overrides: [
          { metric: 'spo2', value: 92 },
          {
            metric: 'stress.load',
            value: 80,
            dateRange: { start: '2026-04-20', end: '2026-04-24' },
          },
        ],
      },
    });

    const deps = createEvalRuntime({
      evalCase,
      dataDir: DATA_DIR,
      providerMode: 'fake',
    });

    // getActiveOverrides 应返回 case 中的 overrides
    const overrides = deps.getActiveOverrides('profile-a');
    expect(overrides.length).toBe(2);
    expect(overrides[0]!.metric).toBe('spo2');
    expect(overrides[0]!.value).toBe(92);
    expect(overrides[1]!.metric).toBe('stress.load');

    // 其他 profile 应返回空
    const otherOverrides = deps.getActiveOverrides('other-profile');
    expect(otherOverrides).toEqual([]);
  });

  it('无 dataDir 时使用最小 mock profile', () => {
    const evalCase = makeEvalCase({
      setup: {
        profileId: 'nonexistent-profile',
      },
    });

    const deps = createEvalRuntime({
      evalCase,
      providerMode: 'fake',
    });

    // 应返回最小 mock profile 而不是崩溃
    const profile = deps.getProfile('nonexistent-profile');
    expect(profile).toBeDefined();
    expect(profile.profile.profileId).toBe('nonexistent-profile');
    expect(profile.records.length).toBe(7);
  });

  it('injected events 通过 getInjectedEvents 返回', () => {
    const evalCase = makeEvalCase({
      setup: {
        profileId: 'profile-a',
        injectedEvents: [
          { date: '2026-04-23', type: 'illness', data: { name: '感冒' } },
          { date: '2026-04-24', type: 'medication' },
        ],
      },
    });

    const deps = createEvalRuntime({
      evalCase,
      dataDir: DATA_DIR,
      providerMode: 'fake',
    });

    const events = deps.getInjectedEvents('profile-a');
    expect(events.length).toBe(2);
    expect(events[0]!.date).toBe('2026-04-23');
    expect(events[0]!.type).toBe('illness');
    expect(events[1]!.type).toBe('medication');

    // 其他 profile 应返回空
    const otherEvents = deps.getInjectedEvents('other-profile');
    expect(otherEvents).toEqual([]);
  });

  it('viewSummaryByScope memory 正确 seed', () => {
    const evalCase = makeEvalCase({
      setup: {
        profileId: 'profile-a',
        memory: {
          analytical: {
            latestViewSummaryByScope: {
              'hrv:week': 'HRV 周总结内容',
              'sleep:month': '睡眠月度总结',
            },
          },
        },
      },
    });

    const deps = createEvalRuntime({
      evalCase,
      dataDir: DATA_DIR,
      providerMode: 'fake',
    });

    const analytical = deps.analyticalMemory.get('eval-session');
    expect(analytical).toBeDefined();
    expect(analytical!.latestViewSummaryByScope).toEqual({
      'hrv:week': 'HRV 周总结内容',
      'sleep:month': '睡眠月度总结',
    });
  });
});

describe('createEvalRuntime — timeline', () => {
  it('pending case: 追加 segment 但不 performSync，pendingEventCount > 0', () => {
    const evalCase = makeEvalCase({
      setup: {
        profileId: 'profile-a',
        timeline: {
          // 不设置 performSync → 所有追加的 events 保持 pending
          appendSegments: [
            {
              segmentType: 'walk',
              offsetMinutes: 5,
              durationMinutes: 30,
            },
          ],
        },
      },
    });

    const deps = createEvalRuntime({
      evalCase,
      dataDir: DATA_DIR,
      providerMode: 'fake',
    });

    expect(deps.getTimelineSync).toBeDefined();
    const sync = deps.getTimelineSync!('profile-a');
    expect(sync).toBeDefined();

    // pending events 应 > 0（因为未 performSync）
    expect(sync!.syncMetadata.pendingEventCount).toBeGreaterThan(0);

    // recognizedEvents 应为空（因为 pending 事件不参与识别）
    expect(sync!.recognizedEvents).toEqual([]);

    // 其他 profile 应返回 undefined
    const otherSync = deps.getTimelineSync!('other-profile');
    expect(otherSync).toBeUndefined();
  });

  it('synced case: 追加 segment 后 performSync，recognizedEvents 包含事件', () => {
    const evalCase = makeEvalCase({
      setup: {
        profileId: 'profile-a',
        timeline: {
          performSync: 'app_open',
          appendSegments: [
            {
              segmentType: 'walk',
              offsetMinutes: 5,
              durationMinutes: 30,
            },
          ],
        },
      },
    });

    const deps = createEvalRuntime({
      evalCase,
      dataDir: DATA_DIR,
      providerMode: 'fake',
    });

    const sync = deps.getTimelineSync!('profile-a');
    expect(sync).toBeDefined();

    // 同步后 pendingEventCount 应为 0
    expect(sync!.syncMetadata.pendingEventCount).toBe(0);

    // lastSyncedMeasuredAt 应非 null
    expect(sync!.syncMetadata.lastSyncedMeasuredAt).not.toBeNull();

    // recognizedEvents 应包含 walk segment 识别出的事件
    expect(sync!.recognizedEvents.length).toBeGreaterThan(0);
    const walkEvent = sync!.recognizedEvents.find((e) => e.type === 'walk');
    expect(walkEvent).toBeDefined();
  });

  it('无 timeline setup 时 getTimelineSync 为 undefined', () => {
    const evalCase = makeEvalCase({
      setup: {
        profileId: 'profile-a',
      },
    });

    const deps = createEvalRuntime({
      evalCase,
      dataDir: DATA_DIR,
      providerMode: 'fake',
    });

    // 没有 timeline setup → getTimelineSync 不存在
    expect(deps.getTimelineSync).toBeUndefined();
  });
});
