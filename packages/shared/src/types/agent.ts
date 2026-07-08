import type { ChartTokenId } from './chart-token';
import type { MicroEventParams, MicroEventType } from './micro-event';

export enum AgentTaskType {
  HOMEPAGE_SUMMARY = 'homepage_summary',
  VIEW_SUMMARY = 'view_summary',
  ADVISOR_CHAT = 'advisor_chat',
}

export type DataTab = 'overview' | 'hrv' | 'sleep' | 'resting-hr' | 'activity' | 'spo2' | 'stress';

export type Timeframe = 'day' | 'week' | 'month' | 'year' | 'custom';

export interface PageContext {
  profileId: string;
  page: string;
  dataTab?: DataTab;
  timeframe: Timeframe;
  customDateRange?: { start: string; end: string };
}

export type AgentStatusColor = 'good' | 'warning' | 'error';

export type ActionInteraction =
  | {
      kind: 'calendar';
      calendar: {
        title: string;
        timingLabel: string;
        durationMinutes: number;
      };
    }
  | {
      kind: 'micro_event';
      microEvent: {
        type: MicroEventType;
        durationMinutes?: number;
        params?: MicroEventParams;
      };
    };

export interface ActionOption {
  id: string;
  emoji: string;
  title: string;
  description: string;
  aiPromise: string;
  interaction?: ActionInteraction;
}

/** 未来时间点建议（解释型：预测 + 行动） */
export interface FutureSuggestion {
  /** 建议的时间点，格式 "HH:mm"，必须在 (demoNow, 23:59] 区间 */
  timePoint: string;
  /** 预测的生理状态（概率性语言，如 "HRV 预计降到全天最低 ~32ms"） */
  predictedState: string;
  /** 推断依据（如 "今天已记录 2 杯咖啡，咖啡因代谢影响"） */
  rationale: string;
  /** 行动建议（复用 ActionOption，保留 micro_event/calendar 交互） */
  action: ActionOption;
}

export type MemoryCandidateKind =
  | 'allergy'
  | 'medical_constraint'
  | 'goal'
  | 'preference'
  | 'workflow_contact'
  | 'workflow_consent'
  | 'correction'
  | 'revocation';

export interface MemoryCandidateConfirmation {
  id: string;
  kind: MemoryCandidateKind;
  proposedConfirmationText: string;
  evidenceQuote: string;
}

export interface AgentResponseEnvelope {
  summary: string;
  source: string;
  statusColor: AgentStatusColor;
  chartTokens: ChartTokenId[];
  microTips?: string[];
  actions?: ActionOption[];
  /** LLM 生成的 actions 区段标题，用于替代前端硬编码文案 */
  actionsSectionTitle?: string;
  memoryCandidates?: MemoryCandidateConfirmation[];
  /** 当天剩余时间的 1-2 个未来时间点建议（homepage 任务输出） */
  futureSuggestions?: FutureSuggestion[];
  meta: {
    taskType: AgentTaskType;
    pageContext: PageContext;
    finishReason: 'complete' | 'fallback' | 'timeout' | 'cached';
    sessionId?: string;
  };
}
