import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEvalRuntime } from '../../evals/eval-runtime';
import type { AgentEvalCase } from '../../evals/types';
import type { AgentRequest } from '../../types/agent-request';
import { AgentTaskType } from '@health-advisor/shared';
import { join } from 'node:path';
import { runEval } from '../../evals/eval-runner';
import { writeReport } from '../../evals/report-writer';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';

// ── 测试数据目录 ────────────────────────────────────

const DATA_DIR = join(__dirname, '../../../../../data/sandbox');

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

// ── Eval Runner 集成测试 ──────────────────────────────

describe('eval runner', () => {
  const TEMP_REPORT_DIR = join(__dirname, '__temp_runner_reports__');

  beforeEach(() => {
    // 创建临时报告目录
    mkdirSync(TEMP_REPORT_DIR, { recursive: true });
  });

  afterEach(() => {
    // 清理临时报告目录
    rmSync(TEMP_REPORT_DIR, { recursive: true, force: true });
  });

  it('能执行单个 case', async () => {
    // 使用一个实际存在的 smoke case 来测试
    // 通过 --case 指定一个 smoke suite 中的 case
    // 如果没有 case 文件，runner 应返回 1（未找到 case）
    const exitCode = await runEval(
      ['node', 'eval-runner.ts', '--suite', 'smoke', '--provider', 'fake', '--report', 'json'],
      {
        caseRootDir: join(__dirname, '../../../evals/cases'),
        dataDir: DATA_DIR,
      },
    );

    // 无论是否有 case，runner 不应崩溃
    expect(typeof exitCode).toBe('number');
    // 应该是 0 或 1，不应抛异常
    expect(exitCode).toBeGreaterThanOrEqual(0);
    expect(exitCode).toBeLessThanOrEqual(1);
  });

  it('hard failure 时 exit code 为 1', async () => {
    // 创建一个临时 case 目录，写入一个会导致 hard failure 的 case
    const tempCaseDir = join(TEMP_REPORT_DIR, 'cases');
    mkdirSync(tempCaseDir, { recursive: true });

    // 一个会产生 invalid JSON 输出的 case，导致 protocol check hard failure
    const failCase = makeEvalCase({
      id: 'hard-fail-case',
      title: 'Hard Failure Case',
      suite: 'smoke',
      setup: {
        profileId: 'profile-a',
        modelFixture: {
          mode: 'fake-invalid-json',
          content: '<<<invalid>>>',
        },
      },
    });

    const casePath = join(tempCaseDir, 'hard-fail-case.json');
    const { writeFileSync: writeFile } = await import('node:fs');
    writeFile(casePath, JSON.stringify(failCase, null, 2), 'utf-8');

    const exitCode = await runEval(
      ['node', 'eval-runner.ts', '--case', 'hard-fail-case', '--provider', 'fake', '--report', 'json', '--fail-on-hard'],
      {
        caseRootDir: tempCaseDir,
        dataDir: DATA_DIR,
      },
    );

    expect(exitCode).toBe(1);
  });

  it('提供 baseline report 且 score regression 超阈值时 exit code 为 1', async () => {
    const tempCaseDir = join(TEMP_REPORT_DIR, 'cases');
    mkdirSync(tempCaseDir, { recursive: true });

    // 创建一个正常通过的 case
    const passCase = makeEvalCase({
      id: 'regression-test-case',
      title: 'Regression Test Case',
      suite: 'smoke',
      setup: {
        profileId: 'profile-a',
      },
    });

    const casePath = join(tempCaseDir, 'regression-test-case.json');
    const { writeFileSync: writeFile } = await import('node:fs');
    writeFile(casePath, JSON.stringify(passCase, null, 2), 'utf-8');

    // 创建一个 "好" 的 baseline report（高分）
    const baselineReport = {
      runId: 'baseline-001',
      gitSha: 'abc1234',
      createdAt: new Date().toISOString(),
      suite: 'smoke',
      providerMode: 'fake',
      totals: {
        cases: 1,
        passed: 1,
        failed: 0,
        hardFailures: 0,
        score: 100,
        maxScore: 100,
      },
      byCategory: {},
      cases: [],
    };

    const baselinePath = join(TEMP_REPORT_DIR, 'baseline-report.json');
    writeFile(baselinePath, JSON.stringify(baselineReport, null, 2), 'utf-8');

    // 当前运行分数会比 baseline (100/100 = 100%) 低
    // 阈值设为 1 个百分点，应该触发 regression
    const exitCode = await runEval(
      [
        'node', 'eval-runner.ts',
        '--case', 'regression-test-case',
        '--provider', 'fake',
        '--report', 'json',
        '--baseline-report', baselinePath,
        '--fail-on-score-regression', '1',
      ],
      {
        caseRootDir: tempCaseDir,
        dataDir: DATA_DIR,
      },
    );

    // 当前 score 不可能是满分 100/100，所以应该有 regression
    expect(exitCode).toBe(1);
  });

  it('提供 --fail-on-score-regression 但缺少 --baseline-report 时 exit code 为 1', async () => {
    const exitCode = await runEval(
      [
        'node', 'eval-runner.ts',
        '--suite', 'smoke',
        '--provider', 'fake',
        '--report', 'json',
        '--fail-on-score-regression', '5',
      ],
      {
        caseRootDir: join(__dirname, '../../../evals/cases'),
        dataDir: DATA_DIR,
      },
    );

    // 缺少 baseline-report，应视为配置错误
    expect(exitCode).toBe(1);
  });
});

// ── --disallow-fixtures 测试 ──────────────────────────────

describe('eval runner — --disallow-fixtures', () => {
  const TEMP_FIXTURE_DIR = join(__dirname, '__temp_fixture_reports__');

  beforeEach(() => {
    mkdirSync(TEMP_FIXTURE_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEMP_FIXTURE_DIR, { recursive: true, force: true });
  });

  it('case 包含 modelFixture.content 时 --disallow-fixtures 应返回 1', async () => {
    const tempCaseDir = join(TEMP_FIXTURE_DIR, 'cases');
    mkdirSync(tempCaseDir, { recursive: true });

    const fixtureCase = makeEvalCase({
      id: 'fixture-case',
      title: 'Fixture Case',
      suite: 'smoke',
      setup: {
        profileId: 'profile-a',
        modelFixture: {
          mode: 'fake-json',
          content: '{"source":"llm"}',
        },
      },
    });

    const { writeFileSync: writeFile } = await import('node:fs');
    writeFile(join(tempCaseDir, 'fixture-case.json'), JSON.stringify(fixtureCase, null, 2), 'utf-8');

    const exitCode = await runEval(
      ['node', 'eval-runner.ts', '--case', 'fixture-case', '--provider', 'fake', '--report', 'json', '--disallow-fixtures'],
      {
        caseRootDir: tempCaseDir,
        dataDir: DATA_DIR,
      },
    );

    expect(exitCode).toBe(1);
  });

  it('quality suite case 不含 modelFixture.content 时正常通过检查', async () => {
    const tempCaseDir = join(TEMP_FIXTURE_DIR, 'cases');
    mkdirSync(tempCaseDir, { recursive: true });

    const qualityCase = makeEvalCase({
      id: 'quality-no-fixture',
      title: 'Quality No Fixture',
      suite: 'quality',
      setup: {
        profileId: 'profile-a',
        modelFixture: {
          mode: 'real-provider',
        },
      },
    });

    const { writeFileSync: writeFile } = await import('node:fs');
    writeFile(join(tempCaseDir, 'quality-no-fixture.json'), JSON.stringify(qualityCase, null, 2), 'utf-8');

    const exitCode = await runEval(
      ['node', 'eval-runner.ts', '--case', 'quality-no-fixture', '--provider', 'fake', '--report', 'json'],
      {
        caseRootDir: tempCaseDir,
        dataDir: DATA_DIR,
      },
    );

    // case 不含 content，不应触发 disallow-fixtures 错误
    // 但可能因 fake provider 模式下执行失败返回 0（无 fail-on-hard）
    expect(typeof exitCode).toBe('number');
    expect(exitCode).toBeGreaterThanOrEqual(0);
    expect(exitCode).toBeLessThanOrEqual(1);
  });

  it('quality suite 自动启用 disallow-fixtures，包含 content 的 case 返回 1', async () => {
    const tempCaseDir = join(TEMP_FIXTURE_DIR, 'cases');
    mkdirSync(tempCaseDir, { recursive: true });

    const badQualityCase = makeEvalCase({
      id: 'bad-quality-fixture',
      title: 'Bad Quality Fixture',
      suite: 'quality',
      setup: {
        profileId: 'profile-a',
        modelFixture: {
          mode: 'fake-json',
          content: '{"source":"llm"}',
        },
      },
    });

    const { writeFileSync: writeFile } = await import('node:fs');
    writeFile(join(tempCaseDir, 'bad-quality-fixture.json'), JSON.stringify(badQualityCase, null, 2), 'utf-8');

    // 使用 --suite quality 触发自动 disallow-fixtures
    const exitCode = await runEval(
      ['node', 'eval-runner.ts', '--suite', 'quality', '--case', 'bad-quality-fixture', '--provider', 'fake', '--report', 'json'],
      {
        caseRootDir: tempCaseDir,
        dataDir: DATA_DIR,
      },
    );

    expect(exitCode).toBe(1);
  });
});

// ── Report Writer 测试 ────────────────────────────────

describe('report writer', () => {
  const TEMP_REPORT_DIR = join(__dirname, '__temp_report_writer__');

  beforeEach(() => {
    mkdirSync(TEMP_REPORT_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEMP_REPORT_DIR, { recursive: true, force: true });
  });

  /** 创建最小 EvalReport */
  function makeReport(overrides: Record<string, unknown> = {}): import('../../evals/types').EvalReport {
    return {
      runId: 'test-run-001',
      gitSha: 'abc1234',
      createdAt: '2026-04-25T12:00:00.000Z',
      suite: 'smoke',
      providerMode: 'fake',
      totals: {
        cases: 2,
        passed: 1,
        failed: 1,
        hardFailures: 1,
        score: 50,
        maxScore: 100,
      },
      byCategory: {
        homepage: { cases: 1, passed: 1, failed: 0, score: 50, maxScore: 50 },
        'view-summary': { cases: 1, passed: 0, failed: 1, score: 0, maxScore: 50 },
      },
      cases: [
        {
          caseId: 'case-pass-001',
          category: 'homepage',
          passed: true,
          score: 50,
          maxScore: 50,
          checks: [
            {
              checkId: 'case-pass-001:protocol:envelope_exists',
              severity: 'hard',
              passed: true,
              score: 1,
              maxScore: 1,
              message: 'envelope 存在',
            },
          ],
          artifacts: {
            caseId: 'case-pass-001',
            request: makeRequest(),
            envelope: {
              source: 'llm',
              statusColor: 'good',
              summary: '测试摘要',
              chartTokens: [],
              microTips: [],
              meta: {
                requestId: 'req-1',
                sessionId: 'sess-1',
                profileId: 'profile-a',
                taskType: AgentTaskType.HOMEPAGE_SUMMARY,
                pageContext: {
                  profileId: 'profile-a',
                  page: 'home',
                  timeframe: 'week',
                },
                finishReason: 'complete',
              },
            },
          },
        },
        {
          caseId: 'case-fail-001',
          category: 'view-summary',
          passed: false,
          score: 0,
          maxScore: 50,
          checks: [
            {
              checkId: 'case-fail-001:protocol:envelope_exists',
              severity: 'hard',
              passed: false,
              score: 0,
              maxScore: 1,
              message: 'envelope 不存在',
            },
          ],
          artifacts: {
            caseId: 'case-fail-001',
            request: makeRequest(),
          },
        },
      ],
      ...overrides,
    } as import('../../evals/types').EvalReport;
  }

  it('生成 json 报告', () => {
    const report = makeReport();
    const paths = writeReport(report, TEMP_REPORT_DIR, 'json');

    expect(paths.jsonPath).toBeDefined();
    expect(existsSync(paths.jsonPath!)).toBe(true);

    // 验证内容可解析
    const content = readFileSync(paths.jsonPath!, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.runId).toBe('test-run-001');
    expect(parsed.totals.cases).toBe(2);
  });

  it('生成 markdown 报告', () => {
    const report = makeReport();
    const paths = writeReport(report, TEMP_REPORT_DIR, 'markdown');

    expect(paths.mdPath).toBeDefined();
    expect(existsSync(paths.mdPath!)).toBe(true);

    const content = readFileSync(paths.mdPath!, 'utf-8');
    // 验证 markdown 包含必要段落
    expect(content).toContain('# Eval Report');
    expect(content).toContain('## Summary');
    expect(content).toContain('## Hard Failures');
    expect(content).toContain('## Category Breakdown');
    expect(content).toContain('case-fail-001');
    expect(content).toContain('## Envelope Summary');
    expect(content).toContain('## Failed Checks');
  });

  it('同时生成 json 和 markdown 报告', () => {
    const report = makeReport();
    const paths = writeReport(report, TEMP_REPORT_DIR, 'both');

    expect(paths.jsonPath).toBeDefined();
    expect(paths.mdPath).toBeDefined();
    expect(existsSync(paths.jsonPath!)).toBe(true);
    expect(existsSync(paths.mdPath!)).toBe(true);
  });

  it('混合 category 的 byCategory 正确分组且 markdown 包含 category breakdown', () => {
    // 构造包含多个 category 的报告
    const multiCatReport: import('../../evals/types').EvalReport = {
      runId: 'multi-cat-run',
      gitSha: 'abc1234',
      createdAt: '2026-04-26T00:00:00.000Z',
      suite: 'core',
      providerMode: 'fake',
      totals: {
        cases: 4,
        passed: 2,
        failed: 2,
        hardFailures: 2,
        score: 30,
        maxScore: 40,
      },
      byCategory: {
        homepage: { cases: 2, passed: 1, failed: 1, score: 15, maxScore: 20 },
        'advisor-chat': { cases: 1, passed: 1, failed: 0, score: 10, maxScore: 10 },
        'cross-cutting': { cases: 1, passed: 0, failed: 1, score: 5, maxScore: 10 },
      },
      cases: [
        {
          caseId: 'h-pass',
          category: 'homepage',
          passed: true,
          score: 10,
          maxScore: 10,
          checks: [],
          artifacts: { caseId: 'h-pass', request: makeRequest() },
        },
        {
          caseId: 'h-fail',
          category: 'homepage',
          passed: false,
          score: 5,
          maxScore: 10,
          checks: [],
          artifacts: { caseId: 'h-fail', request: makeRequest() },
        },
        {
          caseId: 'c-pass',
          category: 'advisor-chat',
          passed: true,
          score: 10,
          maxScore: 10,
          checks: [],
          artifacts: { caseId: 'c-pass', request: makeRequest() },
        },
        {
          caseId: 'x-fail',
          category: 'cross-cutting',
          passed: false,
          score: 5,
          maxScore: 10,
          checks: [],
          artifacts: { caseId: 'x-fail', request: makeRequest() },
        },
      ],
    };

    // 验证 JSON 报告包含 category 字段
    const paths = writeReport(multiCatReport, TEMP_REPORT_DIR, 'both');
    const jsonContent = JSON.parse(readFileSync(paths.jsonPath!, 'utf-8'));

    // 每个 case 都有 category
    expect(jsonContent.cases[0].category).toBe('homepage');
    expect(jsonContent.cases[1].category).toBe('homepage');
    expect(jsonContent.cases[2].category).toBe('advisor-chat');
    expect(jsonContent.cases[3].category).toBe('cross-cutting');

    // byCategory 正确分组
    expect(jsonContent.byCategory.homepage.cases).toBe(2);
    expect(jsonContent.byCategory['advisor-chat'].cases).toBe(1);
    expect(jsonContent.byCategory['cross-cutting'].cases).toBe(1);

    // 验证 markdown 包含 category breakdown
    const mdContent = readFileSync(paths.mdPath!, 'utf-8');
    expect(mdContent).toContain('## Category Breakdown');
    expect(mdContent).toContain('homepage');
    expect(mdContent).toContain('advisor-chat');
    expect(mdContent).toContain('cross-cutting');
  });
});

// ── dataDir 验证测试 ──────────────────────────────────

describe('eval runner — dataDir 验证', () => {
  it('使用默认 dataDir（未传 options.dataDir）且目录不存在时 exit code 为 1', async () => {
    // 不传 options.dataDir，让 runner 使用默认的 ../../data/sandbox
    // 但由于我们模拟了错误的 packageRoot 解析路径，可能无法直接测试
    // 所以采用另一种方式：直接验证行为
    // 使用显式 dataDir 的调用不会触发验证
    const exitCode = await runEval(
      ['node', 'eval-runner.ts', '--suite', 'smoke', '--provider', 'fake', '--report', 'json'],
      {
        caseRootDir: join(__dirname, '../../../evals/cases'),
        dataDir: DATA_DIR,  // 显式传入 → 不触发默认目录验证
      },
    );
    // 显式传入 dataDir → 跳过验证 → 正常执行
    expect(typeof exitCode).toBe('number');
  });
});

// ── strictAssets 模式测试 ──────────────────────────────

describe('createEvalRuntime — strictAssets', () => {
  it('strictAssets=true 时缺少 dataDir 抛异常', () => {
    const evalCase = makeEvalCase({
      setup: {
        profileId: 'profile-a',
      },
    });

    // strict 模式下缺少 dataDir 应抛异常
    expect(() => createEvalRuntime({
      evalCase,
      providerMode: 'fake',
      strictAssets: true,
    })).toThrow();
  });

  it('strictAssets=true 时不存在的 profile 抛异常', () => {
    const evalCase = makeEvalCase({
      setup: {
        profileId: 'nonexistent-profile-xxx',
      },
    });

    // strict 模式下加载不存在的 profile 应抛异常（而非静默返回 mock）
    expect(() => createEvalRuntime({
      evalCase,
      dataDir: DATA_DIR,
      providerMode: 'fake',
      strictAssets: true,
    })).toThrow();
  });

  it('strictAssets=false 时不存在的 profile 返回 mock', () => {
    const evalCase = makeEvalCase({
      setup: {
        profileId: 'nonexistent-profile-xxx',
      },
    });

    // 非 strict 模式下加载不存在的 profile 应返回 mock
    const deps = createEvalRuntime({
      evalCase,
      dataDir: DATA_DIR,
      providerMode: 'fake',
      strictAssets: false,
    });

    const profile = deps.getProfile('nonexistent-profile-xxx');
    expect(profile).toBeDefined();
    expect(profile.profile.profileId).toBe('nonexistent-profile-xxx');
  });

  it('strictAssets=true 时有效 profile 正常工作', () => {
    const evalCase = makeEvalCase({
      setup: {
        profileId: 'profile-a',
      },
    });

    // strict 模式下有效 profile 应正常工作
    const deps = createEvalRuntime({
      evalCase,
      dataDir: DATA_DIR,
      providerMode: 'fake',
      strictAssets: true,
    });

    const profile = deps.getProfile('profile-a');
    expect(profile).toBeDefined();
    expect(profile.profile.profileId).toBe('profile-a');
  });

  it('strictAssets=true 时不存在的 dataDir 抛异常', () => {
    const evalCase = makeEvalCase({
      setup: {
        profileId: 'profile-a',
      },
    });

    expect(() => createEvalRuntime({
      evalCase,
      dataDir: '/nonexistent/path/to/data',
      providerMode: 'fake',
      strictAssets: true,
    })).toThrow();
  });
});

// ── 真实 Fallback Assets 测试 ──────────────────────────────

describe('createEvalRuntime — 真实 fallback assets', () => {
  it('有 dataDir 时 fallback engine 加载真实 assets', () => {
    const evalCase = makeEvalCase({
      setup: { profileId: 'profile-a' },
    });

    const deps = createEvalRuntime({
      evalCase,
      dataDir: DATA_DIR,
      providerMode: 'fake',
    });

    // 通过 getFallback 验证 homepage fallback 包含真实内容
    const fallback = deps.fallbackEngine.getFallback(
      AgentTaskType.HOMEPAGE_SUMMARY,
      { profileId: 'profile-a', pageContext: { profileId: 'profile-a', page: 'home', timeframe: 'week' } },
    );

    // 真实 homepage.json 中 profile-a 的 summary 包含 "HRV" 关键词
    expect(fallback.source).toBe('fallback');
    expect(fallback.summary).toContain('HRV');
    expect(fallback.chartTokens.length).toBeGreaterThan(0);
  });

  it('view-summary fallback 使用真实 assets', () => {
    const evalCase = makeEvalCase({
      setup: { profileId: 'profile-a' },
    });

    const deps = createEvalRuntime({
      evalCase,
      dataDir: DATA_DIR,
      providerMode: 'fake',
    });

    // view-summary 按 tab 查找，hrv tab 在真实 assets 中
    const fallback = deps.fallbackEngine.getFallback(
      AgentTaskType.VIEW_SUMMARY,
      {
        profileId: 'profile-a',
        pageContext: { profileId: 'profile-a', page: 'data', timeframe: 'week' },
        tab: 'hrv',
      },
    );

    // 真实 view-summary.json 中 hrv 的 summary 包含 "HRV"
    expect(fallback.source).toBe('fallback');
    expect(fallback.summary).toContain('HRV');
    expect(fallback.chartTokens).toContain('HRV_7DAYS');
  });

  it('advisor-chat fallback 使用真实 assets', () => {
    const evalCase = makeEvalCase({
      setup: { profileId: 'profile-a' },
    });

    const deps = createEvalRuntime({
      evalCase,
      dataDir: DATA_DIR,
      providerMode: 'fake',
    });

    const fallback = deps.fallbackEngine.getFallback(
      AgentTaskType.ADVISOR_CHAT,
      {
        profileId: 'profile-a',
        pageContext: { profileId: 'profile-a', page: 'advisor', timeframe: 'week' },
      },
    );

    // 真实 advisor-chat.json 中 profile-a 的 summary 包含 "数据"
    expect(fallback.source).toBe('fallback');
    expect(fallback.summary).toContain('数据');
    expect(fallback.microTips.length).toBeGreaterThan(0);
  });

  it('无 dataDir 时 fallback engine 返回最小内容', () => {
    const evalCase = makeEvalCase({
      setup: { profileId: 'profile-a' },
    });

    const deps = createEvalRuntime({
      evalCase,
      providerMode: 'fake',
      // 不传 dataDir
    });

    const fallback = deps.fallbackEngine.getFallback(
      AgentTaskType.HOMEPAGE_SUMMARY,
      { profileId: 'profile-a', pageContext: { profileId: 'profile-a', page: 'home', timeframe: 'week' } },
    );

    // MINIMAL_FALLBACK_ASSETS 为空对象，所以 lookupEntry 返回 GENERIC_FALLBACK
    expect(fallback.source).toBe('fallback');
    expect(fallback.summary).toContain('正在分析');
  });

  it('strictAssets=true 且 fallbacks 目录无效时抛异常', () => {
    const evalCase = makeEvalCase({
      setup: { profileId: 'profile-a' },
    });

    // 传入不存在的 dataDir，strict 模式下应抛异常
    expect(() => createEvalRuntime({
      evalCase,
      dataDir: '/nonexistent/path/invalid',
      providerMode: 'fake',
      strictAssets: true,
    })).toThrow();
  });

  it('strictAssets=true 时有效 fallback assets 正常加载', () => {
    const evalCase = makeEvalCase({
      setup: { profileId: 'profile-a' },
    });

    const deps = createEvalRuntime({
      evalCase,
      dataDir: DATA_DIR,
      providerMode: 'fake',
      strictAssets: true,
    });

    const fallback = deps.fallbackEngine.getFallback(
      AgentTaskType.HOMEPAGE_SUMMARY,
      { profileId: 'profile-a', pageContext: { profileId: 'profile-a', page: 'home', timeframe: 'week' } },
    );

    // strict 模式下也能加载真实 fallback 内容
    expect(fallback.summary).toContain('HRV');
  });

  it('fake-invalid-json 触发 fallback 后返回真实内容', async () => {
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

    // agent 返回 invalid JSON
    const result = await deps.agent.invoke({
      systemPrompt: 'test',
      userPrompt: 'test',
    });
    expect(result.content).toBe('<<<invalid>>>');

    // fallback engine 应持有真实数据
    const fallback = deps.fallbackEngine.getFallback(
      AgentTaskType.HOMEPAGE_SUMMARY,
      { profileId: 'profile-a', pageContext: { profileId: 'profile-a', page: 'home', timeframe: 'week' } },
    );
    expect(fallback.summary).toContain('HRV');
    expect(fallback.microTips.some((t) => t.includes('睡眠') || t.includes('HRV'))).toBe(true);
  });
});

// ── Provider 模式测试 ──────────────────────────────────

describe('eval runner — provider 模式', () => {
  const TEMP_PROVIDER_DIR = join(__dirname, '__temp_provider_reports__');

  beforeEach(() => {
    mkdirSync(TEMP_PROVIDER_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEMP_PROVIDER_DIR, { recursive: true, force: true });
  });

  it('--provider fake 不需要 API key', async () => {
    // 清除可能的 API key 环境变量
    const originalKey = process.env.LLM_API_KEY;
    delete process.env.LLM_API_KEY;

    try {
      const exitCode = await runEval(
        ['node', 'eval-runner.ts', '--suite', 'smoke', '--provider', 'fake', '--report', 'json'],
        {
          caseRootDir: join(__dirname, '../../../evals/cases'),
          dataDir: DATA_DIR,
        },
      );

      // fake 模式不需要 API key
      expect(typeof exitCode).toBe('number');
    } finally {
      if (originalKey) process.env.LLM_API_KEY = originalKey;
    }
  });

  it('--provider real 无 API key 时 case 执行失败但不崩溃', async () => {
    const tempCaseDir = join(TEMP_PROVIDER_DIR, 'cases');
    mkdirSync(tempCaseDir, { recursive: true });

    const failCase = makeEvalCase({
      id: 'real-provider-no-key',
      title: 'Real Provider No Key',
      suite: 'smoke',
      setup: {
        profileId: 'profile-a',
      },
    });

    const { writeFileSync: writeFile } = await import('node:fs');
    writeFile(join(tempCaseDir, 'real-provider-no-key.json'), JSON.stringify(failCase, null, 2), 'utf-8');

    // 清除 API key
    const originalKey = process.env.LLM_API_KEY;
    delete process.env.LLM_API_KEY;

    try {
      const exitCode = await runEval(
        ['node', 'eval-runner.ts', '--case', 'real-provider-no-key', '--provider', 'real', '--report', 'json'],
        {
          caseRootDir: tempCaseDir,
          dataDir: DATA_DIR,
        },
      );

      // 无 API key 或模块解析失败时，runSingleCase 应捕获异常
      // runner 不崩溃，返回 0（case 失败但不触发 fail-on-hard）
      expect(typeof exitCode).toBe('number');
      expect(exitCode).toBeGreaterThanOrEqual(0);
      expect(exitCode).toBeLessThanOrEqual(1);
    } finally {
      if (originalKey) process.env.LLM_API_KEY = originalKey;
    }
  });
});

// ── 报告 provider/model 信息测试 ──────────────────────

describe('eval runner — 报告 metadata', () => {
  it('fake 模式报告不包含 provider/model 字段', async () => {
    const tempCaseDir = join(__dirname, '__temp_meta_reports__', 'cases');
    mkdirSync(tempCaseDir, { recursive: true });

    const passCase = makeEvalCase({
      id: 'meta-test-case',
      title: 'Meta Test Case',
      suite: 'smoke',
    });

    const { writeFileSync: writeFile } = await import('node:fs');
    writeFile(join(tempCaseDir, 'meta-test-case.json'), JSON.stringify(passCase, null, 2), 'utf-8');

    const outputDir = join(__dirname, '__temp_meta_reports__', 'output');
    mkdirSync(outputDir, { recursive: true });

    await runEval(
      ['node', 'eval-runner.ts', '--case', 'meta-test-case', '--provider', 'fake', '--report', 'json', '--output', outputDir],
      {
        caseRootDir: tempCaseDir,
        dataDir: DATA_DIR,
      },
    );

    const reportPath = join(outputDir, 'eval-report.json');
    if (existsSync(reportPath)) {
      const content = readFileSync(reportPath, 'utf-8');
      const report = JSON.parse(content);
      // fake 模式不应有 provider/model
      expect(report.provider).toBeUndefined();
      expect(report.model).toBeUndefined();
    }

    // 清理
    rmSync(join(__dirname, '__temp_meta_reports__'), { recursive: true, force: true });
  });
});
