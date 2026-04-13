import type { AgentTaskType, DataTab, Timeframe, PageContext } from '@health-advisor/shared';

export type AgentStatusColor = 'green' | 'yellow' | 'red';

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
}
