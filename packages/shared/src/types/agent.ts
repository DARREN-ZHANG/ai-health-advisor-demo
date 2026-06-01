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
  meta: {
    taskType: AgentTaskType;
    pageContext: PageContext;
    finishReason: 'complete' | 'fallback' | 'timeout' | 'cached';
    sessionId?: string;
  };
}
