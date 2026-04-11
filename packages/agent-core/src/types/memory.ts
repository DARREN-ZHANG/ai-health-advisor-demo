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
  updatedAt: number;
}
