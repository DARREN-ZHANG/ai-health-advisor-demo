import { describe, it, expect } from 'vitest';
import { buildAgentContext } from '../../context/context-builder';
import type { AgentRequest } from '../../types/agent-request';
import type { ContextBuilderDeps } from '../../context/context-types';
import type { ProfileData, DailyRecord } from '@health-advisor/shared';
import type { OverrideEntry, DatedEvent } from '@health-advisor/sandbox';
import { AgentTaskType } from '@health-advisor/shared';
import { InMemorySessionMemoryStore } from '../../memory/session-memory-store';
import { InMemoryAnalyticalMemoryStore } from '../../memory/analytical-memory-store';

function makeRecord(date: string, overrides: Partial<DailyRecord> = {}): DailyRecord {
  return { date, hr: [60, 62], sleep: { totalMinutes: 420, startTime: '23:00', endTime: '06:00', stages: { deep: 90, light: 180, rem: 120, awake: 30 }, score: 85 }, activity: { steps: 8000, calories: 2200, activeMinutes: 45, distanceKm: 5.5 }, spo2: 98, stress: { load: 30 }, ...overrides };
}

function makeProfileData(records?: DailyRecord[]): ProfileData {
  return {
    profile: {
      profileId: 'profile-a',
      name: '张健康',
      age: 32,
      gender: 'male',
      avatar: '👨‍💻',
      tags: ['test'],
      baseline: { restingHr: 62, hrv: 58, spo2: 98, avgSleepMinutes: 420, avgSteps: 8500 },
    },
    records: records ?? [
      makeRecord('2026-04-04'),
      makeRecord('2026-04-05'),
      makeRecord('2026-04-06'),
      makeRecord('2026-04-07'),
      makeRecord('2026-04-08'),
      makeRecord('2026-04-09'),
      makeRecord('2026-04-10'),
    ],
  };
}

function makeRequest(overrides: Partial<AgentRequest> = {}): AgentRequest {
  return {
    requestId: 'req-1',
    sessionId: 'sess-1',
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

function makeDeps(profileData?: ProfileData): ContextBuilderDeps {
  const data = profileData ?? makeProfileData();
  return {
    getProfile: () => data,
    selectByTimeframe: (records: DailyRecord[]) => records,
    applyOverrides: (records: DailyRecord[]) => records,
    mergeEvents: (base: DatedEvent[], injected: DatedEvent[]) => [...base, ...injected],
    sessionMemory: new InMemorySessionMemoryStore(),
    analyticalMemory: new InMemoryAnalyticalMemoryStore(),
    getActiveOverrides: () => [],
    getInjectedEvents: () => [],
  };
}

describe('buildAgentContext', () => {
  it('builds complete context for homepage_summary', () => {
    const ctx = buildAgentContext(makeRequest(), makeDeps(), '2026-04-10');

    expect(ctx.profile.profileId).toBe('profile-a');
    expect(ctx.profile.name).toBe('张健康');
    expect(ctx.profile.baselines.restingHR).toBe(62);
    expect(ctx.profile.baselines.hrv).toBe(58);

    expect(ctx.task.type).toBe(AgentTaskType.HOMEPAGE_SUMMARY);
    expect(ctx.task.pageContext.page).toBe('home');

    expect(ctx.dataWindow.records.length).toBeGreaterThan(0);
    expect(ctx.dataWindow.missingFields).toEqual([]);

    expect(ctx.signals.overallStatus).toBe('green');
    expect(ctx.signals.lowData).toBe(false);
  });

  it('uses the session demo clock as the data-window reference date', () => {
    const data = makeProfileData([
      makeRecord('2026-07-01', { activity: { steps: 7100, calories: 2100, activeMinutes: 32, distanceKm: 5.1 } }),
      makeRecord('2026-07-08', { activity: { steps: 8400, calories: 2250, activeMinutes: 41, distanceKm: 6.2 } }),
      makeRecord('2026-07-14', { activity: { steps: 9200, calories: 2380, activeMinutes: 48, distanceKm: 6.9 } }),
    ]);
    const deps = makeDeps(data);
    deps.getDemoNow = () => '2026-07-14T07:05';

    const ctx = buildAgentContext(
      makeRequest({
        taskType: AgentTaskType.ADVISOR_CHAT,
        userMessage: 'how about my activity data',
      }),
      deps,
    );

    expect(ctx.demoNow).toBe('2026-07-14T07:05');
    expect(ctx.dataWindow.end).toBe('2026-07-14');
    expect(ctx.dataWindow.records.map((record) => record.date)).toEqual([
      '2026-07-01',
      '2026-07-08',
      '2026-07-14',
    ]);
    expect(ctx.dataWindow.records.at(-1)?.activity?.steps).toBe(9200);
  });

  it('keeps an explicit reference date above the session demo clock', () => {
    const deps = makeDeps();
    deps.getDemoNow = () => '2026-07-14T07:05';

    const ctx = buildAgentContext(makeRequest(), deps, '2026-04-10');

    expect(ctx.dataWindow.end).toBe('2026-04-10');
    expect(ctx.dataWindow.records).toHaveLength(7);
    expect(ctx.demoNow).toBe('2026-07-14T07:05');
  });

  it('applies overrides to records', () => {
    const overrides: OverrideEntry[] = [
      { metric: 'spo2', value: 92 },
    ];
    const deps = makeDeps();
    deps.getActiveOverrides = () => overrides;

    const ctx = buildAgentContext(makeRequest(), deps, '2026-04-10');
    expect(ctx.dataWindow.records.length).toBeGreaterThan(0);
  });

  it('detects low data when few records', () => {
    const data = makeProfileData([makeRecord('2026-04-10')]);
    const ctx = buildAgentContext(makeRequest(), makeDeps(data), '2026-04-10');
    expect(ctx.signals.lowData).toBe(true);
    expect(ctx.signals.overallStatus).toBe('yellow');
  });

  it('includes injected events in signals', () => {
    const deps = makeDeps();
    deps.getInjectedEvents = () => [
      { date: '2026-04-08', type: 'late_night', data: {} },
    ];
    const ctx = buildAgentContext(makeRequest(), deps, '2026-04-10');
    expect(ctx.signals.events).toContain('2026-04-08 | late_night');
  });

  it('populates memory from stores', () => {
    const deps = makeDeps();
    deps.sessionMemory.appendMessage('sess-1', 'profile-a', {
      role: 'user',
      text: '你好',
      createdAt: Date.now(),
    });
    deps.analyticalMemory.setRuleSummary('sess-1', 'profile-a', '无异常');

    const ctx = buildAgentContext(makeRequest(), deps, '2026-04-10');
    expect(ctx.memory.recentMessages).toHaveLength(1);
    expect(ctx.memory.recentMessages[0]?.text).toBe('你好');
    expect(ctx.memory.latestRuleSummary).toBe('无异常');
  });

  it('populates view summary from analytical memory by scope', () => {
    const deps = makeDeps();
    deps.analyticalMemory.setViewSummary('sess-1', 'profile-a', 'hrv:week', 'HRV 趋势稳定');

    const request = makeRequest({
      taskType: AgentTaskType.VIEW_SUMMARY,
      tab: 'hrv',
      timeframe: 'week',
    });
    const ctx = buildAgentContext(request, deps, '2026-04-10');
    expect(ctx.memory.latestViewSummary).toBe('HRV 趋势稳定');
  });

  it('detects missing fields', () => {
    const records = [
      { date: '2026-04-10' },
      { date: '2026-04-09' },
      { date: '2026-04-08', hr: [60] },
    ] as DailyRecord[];
    const data = makeProfileData(records);
    const ctx = buildAgentContext(makeRequest(), makeDeps(data), '2026-04-10');
    expect(ctx.dataWindow.missingFields.length).toBeGreaterThan(0);
  });

  it('mirrors request task fields', () => {
    const request = makeRequest({
      taskType: AgentTaskType.ADVISOR_CHAT,
      userMessage: '最近感觉怎样',
      smartPromptId: 'sleep-analysis',
      visibleChartIds: ['sleep'],
    });
    const ctx = buildAgentContext(request, makeDeps(), '2026-04-10');
    expect(ctx.task.type).toBe(AgentTaskType.ADVISOR_CHAT);
    expect(ctx.task.userMessage).toBe('最近感觉怎样');
    expect(ctx.task.smartPromptId).toBe('sleep-analysis');
    expect(ctx.task.visibleChartIds).toEqual(['sleep']);
  });

  // ── Memory Isolation Tests ──

  it('does not include memory from different profile', () => {
    const deps = makeDeps();
    deps.sessionMemory.appendMessage('sess-1', 'profile-a', {
      role: 'user',
      text: 'profile-a-msg',
      createdAt: Date.now(),
    });

    const request = makeRequest({ profileId: 'profile-b' });
    const ctx = buildAgentContext(request, deps, '2026-04-10');
    expect(ctx.memory.recentMessages).toHaveLength(0);
  });

  it('does not include analytical memory from different profile', () => {
    const deps = makeDeps();
    deps.analyticalMemory.setHomepageBrief('sess-1', 'profile-a', 'profile-a-brief');

    const request = makeRequest({ profileId: 'profile-b' });
    const ctx = buildAgentContext(request, deps, '2026-04-10');
    expect(ctx.memory.latestHomepageBrief).toBeUndefined();
  });

  it('includes memory when profile matches', () => {
    const deps = makeDeps();
    deps.sessionMemory.appendMessage('sess-1', 'profile-a', {
      role: 'user',
      text: 'profile-a-msg',
      createdAt: Date.now(),
    });

    const ctx = buildAgentContext(makeRequest(), deps, '2026-04-10');
    expect(ctx.memory.recentMessages).toHaveLength(1);
    expect(ctx.memory.recentMessages[0]?.text).toBe('profile-a-msg');
  });

  it('carries synced device samples in timelineSync context', () => {
    const deps = makeDeps();
    const syncedEvents = [
      {
        eventId: 'evt-focus-hr-1',
        profileId: 'profile-a',
        measuredAt: '2026-04-10T10:00',
        metric: 'heartRate',
        value: 72,
        source: 'sensor',
        segmentId: 'seg-focus-1',
      },
      {
        eventId: 'evt-focus-hrv-1',
        profileId: 'profile-a',
        measuredAt: '2026-04-10T10:05',
        metric: 'hrvRmssd',
        value: 55,
        source: 'sensor',
        segmentId: 'seg-focus-1',
      },
    ] as const;

    deps.getTimelineSync = () => ({
      recognizedEvents: [{
        recognizedEventId: 're-focus-1',
        profileId: 'profile-a',
        type: 'deep_focus',
        start: '2026-04-10T10:00',
        end: '2026-04-10T12:00',
        confidence: 0.91,
        evidence: ['平均心率 72, 低运动, 深度专注'],
        sourceSegmentId: 'seg-focus-1',
      }],
      derivedTemporalStates: [],
      syncedEvents: [...syncedEvents],
      syncMetadata: {
        lastSyncedMeasuredAt: '2026-04-10T12:00',
        pendingEventCount: 0,
      },
    });

    const ctx = buildAgentContext(makeRequest(), deps, '2026-04-10');

    expect(ctx.timelineSync?.syncedEvents).toHaveLength(2);
    expect(ctx.timelineSync?.syncedEvents?.[0]?.metric).toBe('heartRate');
    expect(ctx.timelineSync?.recognizedEvents[0]?.sourceSegmentId).toBe('seg-focus-1');
  });
});
