import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import {
  selectActiveVisualState,
  useHealthStatusStore,
} from './health-status.store';
import type { HealthVisualState } from '@/lib/valo-theme';

const ALL_STATES: ReadonlyArray<HealthVisualState> = [
  'prime-readiness',
  'active-recovery',
  'metabolic-sluggish',
  'glycogen-depleted',
];

describe('health-status store', () => {
  beforeEach(() => {
    // 每个用例独立重置 store，避免相互污染
    useHealthStatusStore.setState({
      autoState: 'prime-readiness',
      manualOverride: null,
      lastSyncedDataUpdatedAt: null,
    });
  });

  afterEach(() => {
    useHealthStatusStore.setState({
      autoState: 'prime-readiness',
      manualOverride: null,
      lastSyncedDataUpdatedAt: null,
    });
  });

  it('初始状态：autoState=prime-readiness，无 manualOverride', () => {
    const s = useHealthStatusStore.getState();
    expect(s.autoState).toBe('prime-readiness');
    expect(s.manualOverride).toBeNull();
    expect(s.lastSyncedDataUpdatedAt).toBeNull();
  });

  it('selectActiveVisualState 在无 override 时返回 autoState', () => {
    useHealthStatusStore.setState({ autoState: 'glycogen-depleted' });
    const active = selectActiveVisualState(useHealthStatusStore.getState());
    expect(active).toBe('glycogen-depleted');
  });

  it('设置 manualOverride 后 selectActiveVisualState 返回 override', () => {
    useHealthStatusStore.setState({ autoState: 'prime-readiness' });
    useHealthStatusStore.getState().setManualOverride('metabolic-sluggish');
    const active = selectActiveVisualState(useHealthStatusStore.getState());
    expect(active).toBe('metabolic-sluggish');
  });

  it('setManualOverride(null) 清除覆盖，回到 autoState', () => {
    useHealthStatusStore.getState().setManualOverride('active-recovery');
    useHealthStatusStore.getState().setManualOverride(null);
    const active = selectActiveVisualState(useHealthStatusStore.getState());
    expect(active).toBe('prime-readiness');
  });

  it('setAutoState 首次调用：记录 dataUpdatedAt，无 override 影响', () => {
    useHealthStatusStore.getState().setAutoState('active-recovery', 1_000);
    const s = useHealthStatusStore.getState();
    expect(s.autoState).toBe('active-recovery');
    expect(s.lastSyncedDataUpdatedAt).toBe(1_000);
    expect(s.manualOverride).toBeNull();
  });

  it('setAutoState 用相同 dataUpdatedAt 调用：保留 manualOverride', () => {
    // 第一次同步：建立 lastSyncedDataUpdatedAt
    useHealthStatusStore.getState().setAutoState('active-recovery', 2_000);
    // 用户在本次简报内手动覆盖
    useHealthStatusStore.getState().setManualOverride('glycogen-depleted');
    // 同周期再次写入（同 dataUpdatedAt）：覆盖必须保留
    useHealthStatusStore.getState().setAutoState('active-recovery', 2_000);
    const s = useHealthStatusStore.getState();
    expect(s.autoState).toBe('active-recovery');
    expect(s.manualOverride).toBe('glycogen-depleted');
    expect(s.lastSyncedDataUpdatedAt).toBe(2_000);
  });

  it('setAutoState 用新 dataUpdatedAt 调用：清除 manualOverride', () => {
    useHealthStatusStore.getState().setAutoState('active-recovery', 2_000);
    useHealthStatusStore.getState().setManualOverride('glycogen-depleted');
    // 新简报到达：dataUpdatedAt 变化
    useHealthStatusStore.getState().setAutoState('metabolic-sluggish', 3_000);
    const s = useHealthStatusStore.getState();
    expect(s.autoState).toBe('metabolic-sluggish');
    expect(s.manualOverride).toBeNull();
    expect(s.lastSyncedDataUpdatedAt).toBe(3_000);
  });

  it('selectActiveVisualState：四态穷举覆盖生效', () => {
    for (const state of ALL_STATES) {
      useHealthStatusStore.setState({
        autoState: 'prime-readiness',
        manualOverride: state,
      });
      expect(selectActiveVisualState(useHealthStatusStore.getState())).toBe(
        state,
      );
    }
  });

  it('setAutoState 用相同时间戳但不同状态：仍保留 override，但 autoState 更新', () => {
    // 边界：同一 dataUpdatedAt 下，autoState 字段仍按入参更新；
    // 仅 manualOverride 受 isNewBrief 影响。
    useHealthStatusStore.getState().setAutoState('active-recovery', 5_000);
    useHealthStatusStore.getState().setManualOverride('glycogen-depleted');
    useHealthStatusStore.getState().setAutoState('metabolic-sluggish', 5_000);
    const s = useHealthStatusStore.getState();
    expect(s.autoState).toBe('metabolic-sluggish');
    expect(s.manualOverride).toBe('glycogen-depleted');
  });
});
