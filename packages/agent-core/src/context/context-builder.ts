import type { AgentRequest } from '../types/agent-request';
import type { AgentContext, AgentStatusColor } from '../types/agent-context';
import type { ContextBuilderDeps } from './context-types';
import type { DatedEvent } from '@health-advisor/sandbox';
import type { Locale } from '@health-advisor/shared';
import { localize, DEFAULT_LOCALE } from '@health-advisor/shared';
import { selectWindowByTask } from './window-selector';
import { detectMissingFields } from './missing-fields';
import { LOW_DATA_THRESHOLD } from '../constants/limits';

const DATA_METRICS = ['hr', 'sleep', 'activity', 'spo2', 'stress'] as const;

export function buildAgentContext(
  request: AgentRequest,
  deps: ContextBuilderDeps,
  referenceDate?: string,
  locale: Locale = DEFAULT_LOCALE,
): AgentContext {
  // 1. 解析 profile
  const profileData = deps.getProfile(request.profileId);
  const profile = profileData.profile;

  // 2. 获取 overrides 和 events
  const overrides = deps.getActiveOverrides(request.profileId);
  const injectedEvents = deps.getInjectedEvents(request.profileId);
  const baseEvents = extractBaseEvents(profileData.records);
  const mergedEvents = deps.mergeEvents(baseEvents, injectedEvents);

  // 3. 选择数据窗口
  const windowRange = selectWindowByTask(
    request.taskType,
    referenceDate,
    request.timeframe ?? request.pageContext.timeframe,
    request.dateRange ?? request.pageContext.customDateRange,
  );

  // 4. 应用 overrides
  const overriddenRecords = deps.applyOverrides(profileData.records, overrides);

  // 5. 按窗口筛选
  const windowedRecords = overriddenRecords.filter((r) => {
    return r.date >= windowRange.start && r.date <= windowRange.end;
  });

  // 6. 检测缺失字段
  const missingFields = detectMissingFields(windowedRecords, DATA_METRICS);

  // 7. 计算 signals
  const lowData = windowedRecords.length < LOW_DATA_THRESHOLD;
  const signals: AgentContext['signals'] = {
    overallStatus: computeDefaultStatus(lowData, missingFields),
    anomalies: [],
    trends: [],
    events: mergedEvents.map((e) => `${e.date}: ${e.type}`),
    lowData,
  };

  // 8. 加载 memory（带 profile 校验）
  const recentMessages = deps.sessionMemory
    .getRecentMessagesForProfile(request.sessionId, request.profileId)
    .map((m) => ({ role: m.role, text: m.text }));

  const analytical = deps.analyticalMemory.getForProfile(request.sessionId, request.profileId);
  const effectiveTab = request.tab ?? ('dataTab' in request.pageContext ? (request.pageContext as { dataTab?: string }).dataTab : undefined);
  const effectiveTimeframe = request.timeframe ?? request.pageContext.timeframe;
  const scope = effectiveTab && effectiveTimeframe ? `${effectiveTab}:${effectiveTimeframe}` : undefined;

  // 9. 获取时间轴同步上下文（可选）
  const timelineSync = deps.getTimelineSync?.(request.profileId);

  return {
    profile: {
      profileId: profile.profileId,
      name: localize(profile.name, locale),
      age: profile.age,
      tags: (profile.tags || []).map((tag) => localize(tag, locale)),
      baselines: {
        restingHR: profile.baseline.restingHr,
        hrv: profile.baseline.hrv,
        spo2: profile.baseline.spo2,
        avgSleepMinutes: profile.baseline.avgSleepMinutes,
        avgSteps: profile.baseline.avgSteps,
      },
    },
    task: {
      type: request.taskType,
      pageContext: request.pageContext,
      tab: effectiveTab as import('@health-advisor/shared').DataTab | undefined,
      timeframe: effectiveTimeframe,
      dateRange: request.dateRange ?? request.pageContext.customDateRange,
      userMessage: request.userMessage,
      smartPromptId: request.smartPromptId,
      visibleChartIds: request.visibleChartIds,
    },
    dataWindow: {
      start: windowRange.start,
      end: windowRange.end,
      records: windowedRecords,
      allRecords: overriddenRecords,
      missingFields,
    },
    signals,
    memory: {
      recentMessages,
      latestHomepageBrief: analytical?.latestHomepageBrief,
      latestViewSummary: scope ? analytical?.latestViewSummaryByScope?.[scope] : undefined,
      latestRuleSummary: analytical?.latestRuleSummary,
    },
    ...(timelineSync ? { timelineSync } : {}),
    locale,
  };
}

function computeDefaultStatus(lowData: boolean, missingFields: string[]): AgentStatusColor {
  if (lowData) return 'yellow';
  if (missingFields.length >= 3) return 'yellow';
  return 'green';
}

/**
 * 从 profile records 推导基础事件列表。
 */
function extractBaseEvents(_records: unknown[]): DatedEvent[] {
  return [];
}
