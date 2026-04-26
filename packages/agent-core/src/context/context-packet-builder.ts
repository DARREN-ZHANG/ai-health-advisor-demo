import { AgentTaskType, type DataTab, type Timeframe } from '@health-advisor/shared';
import type { DailyRecord } from '@health-advisor/shared';
import type { AgentContext } from '../types/agent-context';
import type { RuleEvaluationResult } from '../rules/types';
import type {
  TaskContextPacket,
  TaskPacket,
  UserContextPacket,
  DataWindowPacket,
  HomepageContextPacket,
  Latest24hPacket,
  Latest24hMetric,
  RecentEventPacket,
  ViewSummaryContextPacket,
  AdvisorChatContextPacket,
  QuestionIntentPacket,
  CurrentPagePacket,
  RelevantFactPacket,
  ConversationPacket,
  AdvisorConstraintPacket,
  MetricSummary,
  MetricName,
  RuleInsightPacket,
} from './context-packet';
import type { EvidenceCollector } from './evidence-packet';
import { createEvidenceCollector } from './evidence-packet';
import { buildMissingDataPacket } from './missing-data-packet';
import { buildVisibleChartPackets, getChartTokenForTab } from './visible-chart-packet';
import { parseQuestionIntent } from './advisor-intent';
import { buildMetricSummary, buildMetricSummaries, getMetricValue } from './metric-summary';

// ────────────────────────────────────────────
// 主入口
// ────────────────────────────────────────────

export function buildTaskContextPacket(
  context: AgentContext,
  rulesResult: RuleEvaluationResult,
): TaskContextPacket {
  const evidence = createEvidenceCollector();
  const records = context.dataWindow.records as DailyRecord[];
  const baselines = context.profile.baselines;

  const allMetrics: MetricName[] = ['hrv', 'sleep', 'activity', 'stress', 'spo2', 'resting-hr'];

  // Base packets
  const taskPacket = buildTaskPacket(context);
  const userContextPacket = buildUserContextPacket(context);
  const dataWindowPacket = buildDataWindowPacket(context);
  const visibleCharts = buildVisibleChartPackets(
    records,
    context.task.tab,
    context.task.timeframe ?? 'week',
    {
      hrv: baselines.hrv,
      sleep: baselines.avgSleepMinutes,
      activity: baselines.avgSteps,
      'resting-hr': baselines.restingHR,
      spo2: baselines.spo2,
      stress: undefined,
    },
  );
  const allRecords = (context.dataWindow.allRecords as DailyRecord[] | undefined) ?? records;
  const missingData = buildMissingDataPacket(records, allMetrics, evidence, {
    scopes: ['latest24h', 'selectedWindow', 'trend7d', 'visibleChart'],
    allRecords,
    visibleChartMetrics: visibleCharts.map((vc) => vc.metric),
  });

  // Add visible chart evidence
  for (const vc of visibleCharts) {
    for (const eid of vc.evidenceIds) {
      if (!evidence.has(eid)) {
        evidence.add({
          id: eid,
          source: 'daily_records',
          metric: vc.metric,
          dateRange: { start: dataWindowPacket.start, end: dataWindowPacket.end },
          derivation: `visible chart ${vc.chartToken} data summary`,
        });
      }
    }
  }

  const base = {
    task: taskPacket,
    userContext: userContextPacket,
    dataWindow: dataWindowPacket,
    missingData,
    evidence: evidence.items,
    visibleCharts,
  };

  switch (context.task.type) {
    case AgentTaskType.HOMEPAGE_SUMMARY:
      return {
        ...base,
        homepage: buildHomepagePacket(context, rulesResult, evidence),
      };
    case AgentTaskType.VIEW_SUMMARY:
      return {
        ...base,
        viewSummary: buildViewSummaryPacket(context, rulesResult, visibleCharts, evidence),
      };
    case AgentTaskType.ADVISOR_CHAT:
      return {
        ...base,
        advisorChat: buildAdvisorChatPacket(context, rulesResult, visibleCharts, evidence),
      };
    default:
      // Exhaustiveness check
      return base;
  }
}

// ────────────────────────────────────────────
// Task Packet
// ────────────────────────────────────────────

function buildTaskPacket(context: AgentContext): TaskPacket {
  return {
    type: context.task.type,
    page: context.task.pageContext.page,
    tab: context.task.tab,
    timeframe: context.task.timeframe,
    dateRange: context.task.dateRange,
    userMessage: context.task.userMessage,
    smartPromptId: context.task.smartPromptId,
  };
}

// ────────────────────────────────────────────
// User Context Packet
// ────────────────────────────────────────────

function buildUserContextPacket(context: AgentContext): UserContextPacket {
  return {
    profileId: context.profile.profileId,
    name: context.profile.name,
    age: context.profile.age,
    tags: context.profile.tags,
    baselines: context.profile.baselines,
  };
}

// ────────────────────────────────────────────
// Data Window Packet
// ────────────────────────────────────────────

function buildDataWindowPacket(context: AgentContext): DataWindowPacket {
  const records = context.dataWindow.records;
  const totalCount = records.length;
  const nonEmptyRecords = (records as DailyRecord[]).filter((r) => {
    return (
      r.hrv != null ||
      r.sleep != null ||
      r.activity != null ||
      r.spo2 != null ||
      r.stress != null ||
      (Array.isArray(r.hr) && r.hr.length > 0)
    );
  });
  const completenessPct = totalCount > 0 ? Math.round((nonEmptyRecords.length / totalCount) * 100) : 0;

  return {
    start: context.dataWindow.start,
    end: context.dataWindow.end,
    recordCount: totalCount,
    completenessPct,
  };
}

// ────────────────────────────────────────────
// Homepage Packet
// ────────────────────────────────────────────

function buildHomepagePacket(
  context: AgentContext,
  rulesResult: RuleEvaluationResult,
  evidence: EvidenceCollector,
): HomepageContextPacket {
  const records = context.dataWindow.records as DailyRecord[];
  const baselines = context.profile.baselines;

  // recentEvents
  const recentEvents = buildRecentEvents(context, evidence);

  // latest24h
  const latest24h = buildLatest24hPacket(records, baselines, evidence);

  // trend7d
  const trendMetrics: MetricName[] = ['hrv', 'sleep', 'activity', 'stress', 'resting-hr', 'spo2'];
  const trend7d = buildMetricSummaries(records, trendMetrics, {
    hrv: baselines.hrv,
    sleep: baselines.avgSleepMinutes,
    activity: baselines.avgSteps,
    'resting-hr': baselines.restingHR,
    spo2: baselines.spo2,
  });

  // Add trend evidence
  for (const ms of trend7d) {
    for (const eid of ms.evidenceIds) {
      if (!evidence.has(eid)) {
        evidence.addMetric(
          eid,
          'daily_records',
          ms.metric,
          ms.latest?.value ?? ms.average?.value,
          ms.latest?.unit ?? ms.average?.unit ?? '',
          { start: context.dataWindow.start, end: context.dataWindow.end },
          `${ms.metric} trend7d fact`,
        );
      }
    }
  }

  // rules insights
  const rulesInsights: RuleInsightPacket[] = rulesResult.insights.map((i) => ({
    category: i.category,
    severity: i.severity,
    metric: i.metric,
    message: i.message,
  }));

  return {
    recentEvents,
    latest24h,
    trend7d,
    rulesInsights,
    suggestedChartTokens: rulesResult.suggestedChartTokens,
  };
}

function buildRecentEvents(
  context: AgentContext,
  evidence: EvidenceCollector,
): RecentEventPacket[] {
  const events: RecentEventPacket[] = [];

  if (context.timelineSync) {
    const sorted = [...context.timelineSync.recognizedEvents].sort(
      (a, b) => new Date(b.start).getTime() - new Date(a.start).getTime(),
    );

    for (const ev of sorted.slice(0, 5)) {
      const durationMin = Math.round(
        (new Date(ev.end).getTime() - new Date(ev.start).getTime()) / 60000,
      );
      const evidenceId = `event_${ev.type}_${ev.start}`;
      evidence.add({
        id: evidenceId,
        source: 'timeline_sync',
        metric: ev.type,
        dateRange: { start: ev.start, end: ev.end },
        derivation: `recognized event from timeline sync, confidence ${Math.round(ev.confidence * 100)}%`,
      });

      events.push({
        type: ev.type,
        start: ev.start,
        end: ev.end,
        durationMin,
        confidence: ev.confidence,
        syncState: {
          lastSyncedMeasuredAt: context.timelineSync.syncMetadata.lastSyncedMeasuredAt,
          pendingEventCount: context.timelineSync.syncMetadata.pendingEventCount,
          fromSyncedWindow: true,
        },
        evidenceIds: [evidenceId],
      });
    }
  }

  // Add injected events
  if (context.signals.events.length > 0) {
    for (let i = 0; i < context.signals.events.length; i++) {
      const evText = context.signals.events[i];
      const evidenceId = `injected_event_${i}`;
      evidence.add({
        id: evidenceId,
        source: 'rules',
        derivation: `injected event: ${evText}`,
      });
      events.push({
        type: evText!,
        start: '',
        end: '',
        durationMin: 0,
        confidence: 1,
        syncState: {
          lastSyncedMeasuredAt: null,
          pendingEventCount: 0,
          fromSyncedWindow: false,
        },
        evidenceIds: [evidenceId],
      });
    }
  }

  return events;
}

function buildLatest24hPacket(
  records: DailyRecord[],
  baselines: AgentContext['profile']['baselines'],
  evidence: EvidenceCollector,
): Latest24hPacket {
  if (records.length === 0) {
    return { date: '', metrics: [] };
  }

  const latest = records[records.length - 1]!;
  const date = latest.date;

  const metrics: Latest24hMetric[] = [];

  const addMetric = (
    metric: string,
    value: number | undefined,
    unit: string,
    baseline?: number,
  ) => {
    const evidenceId = `latest24h_${metric}_${date}`;
    let status: Latest24hMetric['status'] = 'normal';
    let deltaPctVsBaseline: number | undefined;

    if (value === undefined) {
      status = 'missing';
    } else if (baseline !== undefined && baseline > 0) {
      deltaPctVsBaseline = Math.round(((value - baseline) / baseline) * 100);
      if (Math.abs(deltaPctVsBaseline) > 20) {
        status = 'attention';
      }
    }

    if (value !== undefined) {
      evidence.addMetric(
        evidenceId,
        'daily_records',
        metric,
        value,
        unit,
        { start: date, end: date },
        `latest record for ${metric}`,
      );
    }

    metrics.push({
      metric,
      value,
      unit,
      baseline,
      deltaPctVsBaseline,
      status,
      evidenceId: value !== undefined ? evidenceId : undefined,
    });
  };

  // Sleep
  if (latest.sleep) {
    addMetric('sleep_total', latest.sleep.totalMinutes, 'min', baselines.avgSleepMinutes);
    addMetric('sleep_deep', latest.sleep.stages?.deep, 'min');
    addMetric('sleep_rem', latest.sleep.stages?.rem, 'min');
  } else {
    addMetric('sleep_total', undefined, 'min', baselines.avgSleepMinutes);
  }

  // HRV
  addMetric('hrv', latest.hrv, 'ms', baselines.hrv);

  // Resting HR
  const restingHr = Array.isArray(latest.hr) && latest.hr.length > 0 ? latest.hr[0] : undefined;
  addMetric('resting_hr', restingHr, 'bpm', baselines.restingHR);

  // SpO2
  addMetric('spo2', latest.spo2, '%', baselines.spo2);

  // Stress
  addMetric('stress_load', latest.stress?.load, 'score');

  // Activity
  addMetric('steps', latest.activity?.steps, 'steps', baselines.avgSteps);
  addMetric('active_minutes', latest.activity?.activeMinutes, 'min');

  return { date, metrics };
}

// ────────────────────────────────────────────
// View Summary Packet
// ────────────────────────────────────────────

function buildViewSummaryPacket(
  context: AgentContext,
  rulesResult: RuleEvaluationResult,
  visibleCharts: ViewSummaryContextPacket['visibleCharts'],
  evidence: EvidenceCollector,
): ViewSummaryContextPacket {
  const records = context.dataWindow.records as DailyRecord[];
  const tab = context.task.tab ?? 'overview';
  const timeframe = context.task.timeframe ?? 'week';
  const baselines = context.profile.baselines;

  let selectedMetric: MetricSummary | undefined;
  let overviewMetrics: MetricSummary[] | undefined;

  if (tab !== 'overview') {
    const metricMap: Record<string, MetricName> = {
      hrv: 'hrv',
      sleep: 'sleep',
      activity: 'activity',
      stress: 'stress',
      spo2: 'spo2',
      'resting-hr': 'resting-hr',
    };
    const metric = metricMap[tab];
    if (metric) {
      const baselineMap: Partial<Record<MetricName, number>> = {
        hrv: baselines.hrv,
        sleep: baselines.avgSleepMinutes,
        activity: baselines.avgSteps,
        'resting-hr': baselines.restingHR,
        spo2: baselines.spo2,
      };
      selectedMetric = buildMetricSummary(records, metric, baselineMap[metric], `view_${tab}`);
      // Add evidence
      for (const eid of selectedMetric.evidenceIds) {
        if (!evidence.has(eid)) {
          evidence.add({
            id: eid,
            source: 'daily_records',
            metric,
            dateRange: { start: context.dataWindow.start, end: context.dataWindow.end },
            derivation: `view summary selectedMetric for ${tab}`,
          });
        }
      }
    }
  } else {
    // overview: generate all core metrics
    const overviewMetricNames: MetricName[] = ['hrv', 'sleep', 'resting-hr', 'activity', 'spo2', 'stress'];
    overviewMetrics = buildMetricSummaries(records, overviewMetricNames, {
      hrv: baselines.hrv,
      sleep: baselines.avgSleepMinutes,
      activity: baselines.avgSteps,
      'resting-hr': baselines.restingHR,
      spo2: baselines.spo2,
    });
    for (const ms of overviewMetrics) {
      for (const eid of ms.evidenceIds) {
        if (!evidence.has(eid)) {
          evidence.add({
            id: eid,
            source: 'daily_records',
            metric: ms.metric,
            dateRange: { start: context.dataWindow.start, end: context.dataWindow.end },
            derivation: `overview metric ${ms.metric}`,
          });
        }
      }
    }
  }

  const rulesInsights: RuleInsightPacket[] = rulesResult.insights.map((i) => ({
    category: i.category,
    severity: i.severity,
    metric: i.metric,
    message: i.message,
  }));

  return {
    tab,
    timeframe,
    selectedMetric,
    overviewMetrics,
    visibleCharts,
    rulesInsights,
    suggestedChartTokens: rulesResult.suggestedChartTokens,
  };
}

// ────────────────────────────────────────────
// Advisor Chat Packet
// ────────────────────────────────────────────

function buildAdvisorChatPacket(
  context: AgentContext,
  rulesResult: RuleEvaluationResult,
  visibleCharts: ViewSummaryContextPacket['visibleCharts'],
  evidence: EvidenceCollector,
): AdvisorChatContextPacket {
  const records = context.dataWindow.records as DailyRecord[];
  const userMessage = context.task.userMessage ?? '';
  const baselines = context.profile.baselines;

  // Question intent
  const questionIntent = parseQuestionIntent(userMessage);

  // Current page
  const currentPage: CurrentPagePacket = {
    page: context.task.pageContext.page,
    tab: context.task.tab,
    timeframe: context.task.timeframe,
    visibleChartTokens: visibleCharts.map((vc) => vc.chartToken),
    chartDataSummaries: visibleCharts.map((vc) => {
      const s = vc.dataSummary;
      const parts: string[] = [`${vc.chartToken}:`];
      if (s.latest) parts.push(`latest ${s.latest.value}${s.latest.unit}`);
      if (s.average) parts.push(`avg ${s.average.value}${s.average.unit}`);
      parts.push(`trend ${s.trendDirection}`);
      return parts.join(' ');
    }),
  };

  // Relevant facts
  const relevantFacts = buildRelevantFacts(context, questionIntent, visibleCharts, evidence);

  // Recent conversation
  const recentConversation: ConversationPacket[] = context.memory.recentMessages.map((m) => ({
    role: m.role,
    text: m.text,
  }));

  // Constraints
  const constraints: AdvisorConstraintPacket[] = [
    { type: 'must_cite_evidence', description: '重要建议必须能回溯到至少一个 evidence fact' },
    { type: 'must_disclose_missing', description: '缺失数据必须按 requiredDisclosure 披露' },
    { type: 'must_not_hallucinate', description: '不得补全或编造 evidence 中缺失的事实' },
    { type: 'chart_token_only', description: 'chartTokens 只能来自 visibleCharts 或 suggestedChartTokens' },
  ];

  return {
    userMessage,
    questionIntent,
    currentPage,
    relevantFacts,
    recentConversation,
    constraints,
  };
}

function buildRelevantFacts(
  context: AgentContext,
  intent: QuestionIntentPacket,
  visibleCharts: ViewSummaryContextPacket['visibleCharts'],
  evidence: EvidenceCollector,
): RelevantFactPacket[] {
  const facts: RelevantFactPacket[] = [];
  const records = context.dataWindow.records as DailyRecord[];
  const baselines = context.profile.baselines;
  const dateRange = { start: context.dataWindow.start, end: context.dataWindow.end };

  // Helper to add fact
  const add = (label: string, factType: RelevantFactPacket['factType'], summary: string, evidenceIds: string[]) => {
    facts.push({ label, factType, summary, evidenceIds });
  };

  // Helper to register metric summary evidence into collector
  const registerMetricEvidence = (summary: MetricSummary) => {
    for (const eid of summary.evidenceIds) {
      if (!evidence.has(eid)) {
        evidence.addMetric(
          eid,
          'daily_records',
          summary.metric,
          summary.latest?.value ?? summary.average?.value,
          summary.latest?.unit ?? summary.average?.unit ?? '',
          dateRange,
          `relevant fact metric summary for ${summary.metric}`,
        );
      }
    }
  };

  // 1. Current tab selectedMetric (always include if in Data Center single tab)
  if (context.task.tab && context.task.tab !== 'overview' && context.task.pageContext.page === 'data-center') {
    const chart = visibleCharts.find((vc) => vc.metric === context.task.tab || vc.chartToken.includes(context.task.tab!.toUpperCase()));
    if (chart) {
      const s = chart.dataSummary;
      // Ensure chart evidence is registered
      for (const eid of s.evidenceIds) {
        if (!evidence.has(eid)) {
          evidence.add({ id: eid, source: 'daily_records', metric: s.metric, dateRange, derivation: `visible chart ${chart.chartToken}` });
        }
      }
      add(
        `当前图表: ${chart.chartToken}`,
        'chart',
        `${chart.chartToken} 最新 ${s.latest?.value ?? 'N/A'}${s.latest?.unit ?? ''}, 均值 ${s.average?.value ?? 'N/A'}${s.average?.unit ?? ''}, 趋势 ${s.trendDirection}`,
        s.evidenceIds,
      );
    }
  }

  // 2. User asks about today / yesterday status → latest24h
  if (intent.timeScope === 'today' || intent.timeScope === 'yesterday') {
    if (records.length > 0) {
      const latest = records[records.length - 1]!;
      const latestDate = latest.date;
      const latestMetrics: { label: string; value?: number; unit: string; key: string }[] = [
        { label: 'HRV', value: latest.hrv, unit: 'ms', key: 'hrv' },
        { label: '静息心率', value: Array.isArray(latest.hr) && latest.hr.length > 0 ? latest.hr[0] : undefined, unit: 'bpm', key: 'resting-hr' },
        { label: '睡眠', value: latest.sleep?.totalMinutes, unit: 'min', key: 'sleep' },
        { label: '步数', value: latest.activity?.steps, unit: 'steps', key: 'activity' },
        { label: '压力', value: latest.stress?.load, unit: 'score', key: 'stress' },
        { label: '血氧', value: latest.spo2, unit: '%', key: 'spo2' },
      ];

      for (const m of latestMetrics) {
        if (m.value !== undefined) {
          const evidenceId = `latest24h_${m.key}_${latestDate}`;
          // Register evidence in collector so it can be traced
          evidence.addMetric(
            evidenceId,
            'daily_records',
            m.key,
            m.value,
            m.unit,
            { start: latestDate, end: latestDate },
            `latest record for ${m.key} in advisor chat relevant facts`,
          );
          add(
            `最新${m.label}`,
            'metric',
            `${m.label}: ${m.value}${m.unit}`,
            [evidenceId],
          );
        }
      }
    }
  }

  // 3. User asks about week / recent → selected window metric summaries
  if (intent.timeScope === 'week' || intent.timeScope === 'month' || intent.actionIntent === 'status_summary') {
    const allMetrics: MetricName[] = ['hrv', 'sleep', 'activity', 'stress', 'spo2', 'resting-hr'];
    for (const metric of allMetrics) {
      const summary = buildMetricSummary(records, metric, baselines[metric as keyof typeof baselines] as number | undefined);
      if (summary.latest || summary.average) {
        registerMetricEvidence(summary);
        add(
          `${metric} 窗口摘要`,
          'trend',
          `${metric}: 最新 ${summary.latest?.value ?? 'N/A'}${summary.latest?.unit ?? ''}, 均值 ${summary.average?.value ?? 'N/A'}${summary.average?.unit ?? ''}, 趋势 ${summary.trendDirection}`,
          summary.evidenceIds,
        );
      }
    }
  }

  // 4. User asks about exercise readiness → readiness facts
  if (intent.actionIntent === 'exercise_readiness') {
    const readinessMetrics: MetricName[] = ['sleep', 'hrv', 'stress', 'activity'];
    for (const metric of readinessMetrics) {
      const summary = buildMetricSummary(records, metric, baselines[metric as keyof typeof baselines] as number | undefined);
      if (summary.latest || summary.average) {
        registerMetricEvidence(summary);
        add(
          `${metric} 运动准备度`,
          'metric',
          `${metric}: 最新 ${summary.latest?.value ?? 'N/A'}${summary.latest?.unit ?? ''}, 趋势 ${summary.trendDirection}`,
          summary.evidenceIds,
        );
      }
    }
  }

  // 5. User asks about chart explanation
  if (intent.actionIntent === 'explain_chart') {
    for (const vc of visibleCharts) {
      const s = vc.dataSummary;
      for (const eid of s.evidenceIds) {
        if (!evidence.has(eid)) {
          evidence.add({ id: eid, source: 'daily_records', metric: vc.metric, dateRange, derivation: `visible chart ${vc.chartToken}` });
        }
      }
      add(
        `图表说明: ${vc.chartToken}`,
        'chart',
        `${vc.chartToken}: ${s.latest?.value ?? 'N/A'}${s.latest?.unit ?? ''} latest, avg ${s.average?.value ?? 'N/A'}${s.average?.unit ?? ''}, trend ${s.trendDirection}, completeness ${s.missing.completenessPct}%`,
        s.evidenceIds,
      );
    }
  }

  // 6. Missing data facts
  const missingMetrics = new Set<string>();
  for (const m of context.dataWindow.missingFields) {
    missingMetrics.add(m);
  }
  for (const metric of missingMetrics) {
    const evidenceId = `missing_${metric}_selectedWindow`;
    if (!evidence.has(evidenceId)) {
      evidence.addMissing(evidenceId, metric, 'selectedWindow', dateRange, `${metric} missing in selected window`);
    }
    add(
      `缺失数据: ${metric}`,
      'missing-data',
      `${metric} 数据在当前窗口缺失`,
      [evidenceId],
    );
  }

  return facts;
}
