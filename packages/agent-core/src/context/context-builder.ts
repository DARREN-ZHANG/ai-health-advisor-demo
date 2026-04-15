import type { AgentRequest } from '../types/agent-request';
import type { AgentContext, AgentStatusColor } from '../types/agent-context';
import type { ContextBuilderDeps } from './context-types';
import type { DatedEvent } from '@health-advisor/sandbox';
import { selectWindowByTask } from './window-selector';
import { detectMissingFields } from './missing-fields';
import { LOW_DATA_THRESHOLD } from '../constants/limits';

const DATA_METRICS = ['hr', 'sleep', 'activity', 'spo2', 'stress'] as const;

export function buildAgentContext(
  request: AgentRequest,
  deps: ContextBuilderDeps,
  referenceDate?: string,
): AgentContext {
  // 1. 解析 profile
  const profileData = deps.getProfile(request.profileId);
  const profile = profileData.profile;

  // 2. 获取 overrides 和 events
  const overrides = deps.getActiveOverrides(request.profileId);
  const injectedEvents = deps.getInjectedEvents(request.profileId);
  // 基础记录中提取 base events（从 profile records 推导的事件列表）
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

  // 7. 计算 signals（stub — 规则引擎 Wave 2.2 补齐）
  const lowData = windowedRecords.length < LOW_DATA_THRESHOLD;
  const signals: AgentContext['signals'] = {
    overallStatus: computeDefaultStatus(lowData, missingFields),
    anomalies: [],
    trends: [],
    events: mergedEvents.map((e) => `${e.date}: ${e.type}`),
    lowData,
  };

  // 8. 加载 memory
  const recentMessages = deps.sessionMemory
    .getRecentMessages(request.sessionId)
    .map((m) => ({ role: m.role, text: m.text }));

  const analytical = deps.analyticalMemory.get(request.sessionId);
  const effectiveTab = request.tab ?? ('dataTab' in request.pageContext ? (request.pageContext as { dataTab?: string }).dataTab : undefined);
  const effectiveTimeframe = request.timeframe ?? request.pageContext.timeframe;
  const scope = effectiveTab && effectiveTimeframe ? `${effectiveTab}:${effectiveTimeframe}` : undefined;

  return {
    profile: {
      profileId: profile.profileId,
      name: profile.name,
      age: profile.age,
      tags: profile.tags || [],
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
      missingFields,
    },
    signals,
    memory: {
      recentMessages,
      latestHomepageBrief: analytical?.latestHomepageBrief,
      latestViewSummary: scope ? analytical?.latestViewSummaryByScope?.[scope] : undefined,
      latestRuleSummary: analytical?.latestRuleSummary,
    },
  };
}

function computeDefaultStatus(lowData: boolean, missingFields: string[]): AgentStatusColor {
  if (lowData) return 'yellow';
  if (missingFields.length >= 3) return 'yellow';
  return 'green';
}

/**
 * 从 profile records 推导基础事件列表。
 * 当前 sandbox 数据模型中 records 本身不携带事件类型，
 * 此函数预留为后续接入真实事件系统时的桥接点。
 */
function extractBaseEvents(_records: unknown[]): DatedEvent[] { // eslint-disable-line @typescript-eslint/no-unused-vars
  // sandbox 阶段暂无 base events，返回空数组
  return [];
}
