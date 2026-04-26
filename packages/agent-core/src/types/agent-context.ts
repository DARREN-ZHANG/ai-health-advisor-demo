import type { AgentTaskType, DataTab, Timeframe, PageContext, RecognizedEvent, DerivedTemporalState } from '@health-advisor/shared';

export type AgentStatusColor = 'green' | 'yellow' | 'red';

/** 时间轴同步上下文：让 LLM 了解系统识别到了什么事件和当前派生状态 */
export interface TimelineSyncContext {
  /** 已识别的活动事件 */
  recognizedEvents: RecognizedEvent[];
  /** 派生临时状态（如 recent_meal_30m） */
  derivedTemporalStates: DerivedTemporalState[];
  /** 同步元数据 */
  syncMetadata: {
    lastSyncedMeasuredAt: string | null;
    pendingEventCount: number;
  };
}

export interface AgentContext {
  profile: {
    profileId: string;
    name: string;
    age: number;
    tags: string[];
    baselines: {
      restingHR: number;
      hrv: number;
      spo2: number;
      avgSleepMinutes: number;
      avgSteps: number;
    };
  };
  task: {
    type: AgentTaskType;
    pageContext: PageContext;
    tab?: DataTab;
    timeframe?: Timeframe;
    dateRange?: { start: string; end: string };
    userMessage?: string;
    smartPromptId?: string;
    visibleChartIds?: string[];
  };
  dataWindow: {
    start: string;
    end: string;
    records: unknown[];
    /** 全量记录（含窗口外），用于缺失数据分析如 lastAvailableDate */
    allRecords?: unknown[];
    missingFields: string[];
  };
  signals: {
    overallStatus: AgentStatusColor;
    anomalies: string[];
    trends: string[];
    events: string[];
    lowData: boolean;
  };
  memory: {
    recentMessages: Array<{ role: 'user' | 'assistant'; text: string }>;
    latestHomepageBrief?: string;
    latestViewSummary?: string;
    latestRuleSummary?: string;
  };
  /** 时间轴同步上下文（demo timeline 模式下可用） */
  timelineSync?: TimelineSyncContext;
}
