import { create } from 'zustand';
import type { ActionOption, FutureSuggestion } from '@health-advisor/shared';

/**
 * 首页实时简报流式状态 store。
 *
 * 用途:在 SSE 流式传输过程中,跨组件实例共享"正在进行中的草稿状态"。
 * React Query 缓存只在终态(completed)写入完整 envelope,而流过程中的
 * 增量 delta 文本需要存放在这里,供 UI 渲染打字机效果。
 *
 * 设计约束:
 * - **不持久化**:这是临时状态,刷新页面后用户应重新发起请求而非看到旧 draft。
 * - **不写 React Query cache**:delta 是过程态,query cache 只承载终态数据,
 *   避免缓存被持续更新导致重复渲染与状态错位。
 * - **requestId 守护**:所有操作校验 requestId,stale 请求的事件不能覆盖
 *   新请求的 entry(典型场景:用户快速点两次刷新,第二次 begin 后第一次的
 *   事件仍可能到达)。
 * - **complete/fail 清空 entry**:终态后完整数据进入 React Query cache,
 *   临时 entry 应立即清除,避免 UI 同时显示 draft 和终态。
 */

/** 流阶段:空闲 → 流式中 → 完成/失败(终态) */
export type BriefStreamPhase = 'idle' | 'streaming' | 'done' | 'failed';

/** 单个 profile 的流式草稿条目 */
export interface BriefStreamEntry {
  /** 当前持有该 profile 流的 requestId,用于拒绝 stale 事件 */
  requestId: string;
  /** 流阶段;complete/fail 后 entry 被清除,故 done/failed 实际很少持久存在 */
  phase: BriefStreamPhase;
  /** 累积的增量 summary 文本(UI 据此渲染打字机效果) */
  draftSummary: string;
  /** 按 index 累积的 action 草稿(SSE 乱序到达也按下标归位) */
  draftActions: ActionOption[];
  /** forecast 阶段是否已开始(收到 brief.forecast.started 后置 true,幂等) */
  forecastStarted: boolean;
  /** 按 index 累积的 futureSuggestion 草稿 */
  draftFutureSuggestions: FutureSuggestion[];
}

interface BriefStreamState {
  /** 以 profileId 为键的草稿条目集合 */
  entries: Record<string, BriefStreamEntry>;
  /** 开始一次流:创建 entry,phase=streaming,draft 字段全部清空 */
  begin(profileId: string, requestId: string): void;
  /** 追加 summary delta;requestId 不匹配时静默忽略(stale 事件) */
  append(profileId: string, requestId: string, delta: string): void;
  /** 按 index 放置 action 草稿;requestId 不匹配时静默忽略 */
  appendAction(profileId: string, requestId: string, index: number, action: ActionOption): void;
  /** 标记 forecast 已开始(幂等);requestId 不匹配时静默忽略 */
  markForecastStarted(profileId: string, requestId: string): void;
  /** 按 index 放置 futureSuggestion 草稿;requestId 不匹配时静默忽略 */
  appendFutureSuggestion(
    profileId: string,
    requestId: string,
    index: number,
    suggestion: FutureSuggestion,
  ): void;
  /** 完成:校验 requestId 后清除 entry(终态数据进 React Query cache) */
  complete(profileId: string, requestId: string): void;
  /** 失败:校验 requestId 后清除 entry(同时清空 draft) */
  fail(profileId: string, requestId: string): void;
  /** 读取某个 profile 的当前草稿条目,无则返回 undefined */
  getEntry(profileId: string): BriefStreamEntry | undefined;
}

export const useBriefStreamStore = create<BriefStreamState>((set, get) => ({
  entries: {},

  begin: (profileId, requestId) =>
    set((state) => ({
      entries: {
        ...state.entries,
        [profileId]: {
          requestId,
          phase: 'streaming',
          draftSummary: '',
          draftActions: [],
          forecastStarted: false,
          draftFutureSuggestions: [],
        },
      },
    })),

  append: (profileId, requestId, delta) => {
    // 快速路径:常见 stale 情况(get() 与 set() 之间状态可能变化,但 Zustand set
    // 同步执行、JS 单线程无真正竞态)。这里提前返回只是省一次 set 回调构造,
    // 真正的校验仍以下方 set 回调内的判断为准。
    const current = get().entries[profileId];
    if (!current || current.requestId !== requestId) {
      return;
    }
    set((state) => {
      const entry = state.entries[profileId];
      // 权威校验:set 回调内拿到最新 state,以此为准决定是否写入
      if (!entry || entry.requestId !== requestId) {
        return state;
      }
      return {
        entries: {
          ...state.entries,
          [profileId]: {
            ...entry,
            draftSummary: entry.draftSummary + delta,
          },
        },
      };
    });
  },

  appendAction: (profileId, requestId, index, action) => {
    // 与 append 同型:快路径 + set 回调内权威校验双重守护 requestId
    const current = get().entries[profileId];
    if (!current || current.requestId !== requestId) return;
    set((state) => {
      const entry = state.entries[profileId];
      if (!entry || entry.requestId !== requestId) return state;
      // index-aware 放置:SSE 乱序到达也能按下标归位
      const next = entry.draftActions.slice();
      next[index] = action;
      return {
        entries: {
          ...state.entries,
          [profileId]: { ...entry, draftActions: next },
        },
      };
    });
  },

  markForecastStarted: (profileId, requestId) => {
    // 幂等:已在快路径和 set 回调里双重检查 forecastStarted,避免重复 set
    const current = get().entries[profileId];
    if (!current || current.requestId !== requestId || current.forecastStarted) return;
    set((state) => {
      const entry = state.entries[profileId];
      if (!entry || entry.requestId !== requestId || entry.forecastStarted) return state;
      return {
        entries: {
          ...state.entries,
          [profileId]: { ...entry, forecastStarted: true },
        },
      };
    });
  },

  appendFutureSuggestion: (profileId, requestId, index, suggestion) => {
    const current = get().entries[profileId];
    if (!current || current.requestId !== requestId) return;
    set((state) => {
      const entry = state.entries[profileId];
      if (!entry || entry.requestId !== requestId) return state;
      const next = entry.draftFutureSuggestions.slice();
      next[index] = suggestion;
      return {
        entries: {
          ...state.entries,
          [profileId]: { ...entry, draftFutureSuggestions: next },
        },
      };
    });
  },

  complete: (profileId, requestId) => {
    const current = get().entries[profileId];
    if (!current || current.requestId !== requestId) {
      return;
    }
    set((state) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [profileId]: _removed, ...rest } = state.entries;
      return { entries: rest };
    });
  },

  fail: (profileId, requestId) => {
    const current = get().entries[profileId];
    if (!current || current.requestId !== requestId) {
      return;
    }
    set((state) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [profileId]: _removed, ...rest } = state.entries;
      return { entries: rest };
    });
  },

  getEntry: (profileId) => get().entries[profileId],
}));
