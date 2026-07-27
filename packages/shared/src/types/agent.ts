import type { ChartTokenId } from './chart-token';
import type { MicroEventParams, MicroEventType } from './micro-event';
import type { PlanDraft, PlanDraftInput } from './plan';

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
  /** Advisor 控制的首页 UI 副作用；每次最多一条，由 Planner verifier 校验 */
  uiDirectives?: UiDirective[];
  /**
   * Advisor 输出的结构化计划草稿预览。
   *
   * - 仅当 LLM 明确产出符合 PlanDraftInput schema 的结构时才会出现。
   * - 不含 draftId：agent-api route 层会注册到 plan-store 后注入 draftId，
   *   再以 PlanDraft 形态返回给前端。
   * - fallback / timeout / 安全审核失败 / 解析失败时绝不携带此字段。
   */
  planDraftPreview?: PlanDraftInput;
  /**
   * Agent-api 注入的可执行草稿：含 draftId；前端据此调用
   * POST /sessions/:sessionId/profiles/:profileId/plans/drafts/:draftId/execute。
   * 该字段仅出现在 chat 响应中，且仅当 planDraftPreview 验证通过后注入。
   */
  planDraft?: PlanDraft;
  meta: {
    taskType: AgentTaskType;
    pageContext: PageContext;
    finishReason: 'complete' | 'fallback' | 'timeout' | 'cached';
    sessionId?: string;
  };
}

/**
 * 首页 Trends Brief 卡片的可显示状态。
 * - hidden：不渲染、不占布局
 * - sleep：展示 7 日睡眠简报
 * - activity：展示 7 日活动简报
 */
export type HomeTrendCardDisplay = 'hidden' | 'sleep' | 'activity';

/**
 * 客户端发送给 Advisor 的当前 UI 状态快照。
 * 字段保持封闭枚举，不允许自由文本，避免启发式解析。
 */
export interface ClientUiContext {
  homepageTrendCard: HomeTrendCardDisplay;
}

/**
 * Planner verifier 通过后，runtime 附带给客户端执行的 UI 指令。
 * type 即协议名，display 决定下一帧首页卡片状态。
 */
export interface HomeTrendCardSetDirective {
  type: 'homepage.trend-card.set';
  display: HomeTrendCardDisplay;
}

/**
 * 当前唯一支持的 UI 指令类型；保留 union 形态用于未来扩展。
 */
export type UiDirective = HomeTrendCardSetDirective;
