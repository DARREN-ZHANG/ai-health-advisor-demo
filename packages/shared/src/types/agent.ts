import type { ChartTokenId } from './chart-token';

export enum AgentTaskType {
  HOMEPAGE_SUMMARY = 'homepage_summary',
  VIEW_SUMMARY = 'view_summary',
  ADVISOR_CHAT = 'advisor_chat',
}

export type DataTab = 'hrv' | 'sleep' | 'resting-hr' | 'activity' | 'spo2' | 'stress';

export type Timeframe = 'day' | 'week' | 'month' | 'year' | 'custom';

export interface PageContext {
  profileId: string;
  page: string;
  dataTab?: DataTab;
  timeframe: Timeframe;
  customDateRange?: { start: string; end: string };
}

export type AgentStatusColor = 'good' | 'warning' | 'error';

export interface AgentResponseEnvelope {
  summary: string;
  source: string;
  statusColor: AgentStatusColor;
  chartTokens: ChartTokenId[];
  microTips: string[];
  meta: {
    taskType: AgentTaskType;
    pageContext: PageContext;
    finishReason: 'complete' | 'fallback' | 'timeout';
    sessionId?: string;
  };
}
