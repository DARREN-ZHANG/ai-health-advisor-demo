import type { ChartTokenId, DataTab, Timeframe } from '@health-advisor/shared';

// ────────────────────────────────────────────
// 核心 Metric 类型
// ────────────────────────────────────────────

export type MetricName = 'hrv' | 'sleep' | 'activity' | 'stress' | 'spo2' | 'resting-hr';

export interface MetricValue {
  value: number;
  unit: string;
  date?: string;
}

export interface MissingDataCoverage {
  missingCount: number;
  totalCount: number;
  completenessPct: number;
}

export interface MetricAnomalyPoint {
  date: string;
  value: number;
  expectedRange?: [number, number];
  description: string;
}

export interface MetricSummary {
  metric: MetricName;
  latest?: MetricValue;
  average?: MetricValue;
  min?: MetricValue;
  max?: MetricValue;
  baseline?: MetricValue;
  deltaPctVsBaseline?: number;
  trendDirection: 'up' | 'down' | 'stable' | 'unknown';
  anomalyPoints: MetricAnomalyPoint[];
  missing: MissingDataCoverage;
  evidenceIds: string[];
}

// ────────────────────────────────────────────
// Evidence
// ────────────────────────────────────────────

export type EvidenceSource = 'daily_records' | 'timeline_sync' | 'profile' | 'rules' | 'memory';

export interface EvidenceFact {
  id: string;
  source: EvidenceSource;
  dateRange?: {
    start: string;
    end: string;
  };
  metric?: string;
  value?: number | string | boolean;
  unit?: string;
  derivation: string;
}

// ────────────────────────────────────────────
// Missing Data
// ────────────────────────────────────────────

export type MissingDataScope = 'latest24h' | 'selectedWindow' | 'trend7d' | 'visibleChart';

export interface MissingDataItem {
  metric: string;
  scope: MissingDataScope;
  missingCount: number;
  totalCount: number;
  lastAvailableDate?: string;
  impact: string;
  requiredDisclosure?: string;
  evidenceId: string;
}

// ────────────────────────────────────────────
// Visible Chart
// ────────────────────────────────────────────

export interface VisibleChartPacket {
  chartToken: ChartTokenId;
  metric: MetricName;
  timeframe: Timeframe;
  visible: boolean;
  dataSummary: MetricSummary;
  evidenceIds: string[];
}

// ────────────────────────────────────────────
// Task / User / DataWindow
// ────────────────────────────────────────────

export interface TaskPacket {
  type: string;
  page: string;
  tab?: DataTab;
  timeframe?: Timeframe;
  dateRange?: { start: string; end: string };
  userMessage?: string;
  smartPromptId?: string;
}

export interface UserContextPacket {
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
}

export interface DataWindowPacket {
  start: string;
  end: string;
  recordCount: number;
  completenessPct: number;
}

// ────────────────────────────────────────────
// Homepage
// ────────────────────────────────────────────

export interface Latest24hMetric {
  metric: string;
  value?: number;
  unit: string;
  baseline?: number;
  deltaPctVsBaseline?: number;
  status: 'normal' | 'attention' | 'critical' | 'missing';
  /** 临床严重程度说明（如 SpO2 绝对阈值触发的分级描述） */
  clinicalNote?: string;
  evidenceId?: string;
}

export interface Latest24hPacket {
  date: string;
  metrics: Latest24hMetric[];
}

export interface RecentEventPacket {
  type: string;
  start: string;
  end: string;
  durationMin: number;
  confidence: number;
  syncState: {
    lastSyncedMeasuredAt: string | null;
    pendingEventCount: number;
    fromSyncedWindow: boolean;
  };
  evidenceIds: string[];
}

export interface RuleInsightPacket {
  category: string;
  severity: string;
  metric?: string;
  message: string;
}

export interface HomepageContextPacket {
  recentEvents: RecentEventPacket[];
  latest24h: Latest24hPacket;
  trend7d: MetricSummary[];
  rulesInsights: RuleInsightPacket[];
  suggestedChartTokens: ChartTokenId[];
}

// ────────────────────────────────────────────
// View Summary
// ────────────────────────────────────────────

export interface ViewSummaryContextPacket {
  tab: DataTab;
  timeframe: Timeframe;
  selectedMetric?: MetricSummary;
  overviewMetrics?: MetricSummary[];
  visibleCharts: VisibleChartPacket[];
  rulesInsights: RuleInsightPacket[];
  suggestedChartTokens: ChartTokenId[];
}

// ────────────────────────────────────────────
// Advisor Chat
// ────────────────────────────────────────────

export interface QuestionIntentPacket {
  metricFocus: string[];
  timeScope: 'today' | 'yesterday' | 'week' | 'month' | 'custom' | 'unknown';
  actionIntent: 'explain_chart' | 'exercise_readiness' | 'status_summary' | 'ask_why' | 'general';
  riskLevel: 'general' | 'potential_risk' | 'safety_boundary';
}

export interface CurrentPagePacket {
  page: string;
  tab?: DataTab;
  timeframe?: Timeframe;
  visibleChartTokens: ChartTokenId[];
  chartDataSummaries: string[];
}

export interface RelevantFactPacket {
  label: string;
  factType: 'metric' | 'trend' | 'missing-data' | 'chart' | 'event' | 'memory';
  summary: string;
  evidenceIds: string[];
}

export interface ConversationPacket {
  role: 'user' | 'assistant';
  text: string;
}

export interface AdvisorConstraintPacket {
  type: 'must_cite_evidence' | 'must_disclose_missing' | 'must_not_hallucinate' | 'chart_token_only';
  description: string;
}

export interface AdvisorChatContextPacket {
  userMessage: string;
  questionIntent: QuestionIntentPacket;
  currentPage: CurrentPagePacket;
  relevantFacts: RelevantFactPacket[];
  recentConversation: ConversationPacket[];
  constraints: AdvisorConstraintPacket[];
}

// ────────────────────────────────────────────
// 顶层 Packet
// ────────────────────────────────────────────

export interface TaskContextPacket {
  task: TaskPacket;
  userContext: UserContextPacket;
  dataWindow: DataWindowPacket;
  missingData: MissingDataItem[];
  evidence: EvidenceFact[];
  visibleCharts: VisibleChartPacket[];
  homepage?: HomepageContextPacket;
  viewSummary?: ViewSummaryContextPacket;
  advisorChat?: AdvisorChatContextPacket;
}
