import { create } from 'zustand';

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
}

interface BriefStreamState {
  /** 以 profileId 为键的草稿条目集合 */
  entries: Record<string, BriefStreamEntry>;
  /** 开始一次流:创建 entry,phase=streaming,draftSummary 清空 */
  begin(profileId: string, requestId: string): void;
  /** 追加 delta;requestId 不匹配时静默忽略(stale 事件) */
  append(profileId: string, requestId: string, delta: string): void;
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
        },
      },
    })),

  append: (profileId, requestId, delta) => {
    const current = get().entries[profileId];
    // 无 entry 或 stale 请求,静默忽略
    if (!current || current.requestId !== requestId) {
      return;
    }
    set((state) => {
      const entry = state.entries[profileId];
      if (!entry || entry.requestId !== requestId) {
        // 双重校验:set 回调里再确认一次,避免并发更新竞态
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

  complete: (profileId, requestId) => {
    const current = get().entries[profileId];
    if (!current || current.requestId !== requestId) {
      return;
    }
    set((state) => {
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
      const { [profileId]: _removed, ...rest } = state.entries;
      return { entries: rest };
    });
  },

  getEntry: (profileId) => get().entries[profileId],
}));
