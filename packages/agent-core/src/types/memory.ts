export interface ConversationMessage {
  role: 'user' | 'assistant';
  text: string;
  createdAt: number;
}

export interface SessionConversationMemory {
  sessionId: string;
  profileId: string;
  messages: ConversationMessage[];
  updatedAt: number;
}

export interface AnalyticalMemory {
  sessionId: string;
  profileId: string;
  latestHomepageBrief?: string;
  latestViewSummaryByScope?: Record<string, string>;
  latestRuleSummary?: string;
  /** 历次 homepage 简报推荐的行动类别（累计，上限 20 条） */
  latestHomepageActions?: RecentRecommendedAction[];
  updatedAt: number;
}

export interface RecentRecommendedAction {
  category: string;
  microEventType?: string;
  title: string;
  timestamp: number;
}
