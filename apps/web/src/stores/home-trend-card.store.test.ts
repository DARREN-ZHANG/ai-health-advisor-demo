import { beforeEach, describe, expect, it } from 'vitest';
import {
  selectHomeTrendCardDisplay,
  useHomeTrendCardStore,
  type HomeTrendCardState,
} from './home-trend-card.store';

/**
 * Home Trend Card store 单元测试：profile 隔离、默认 hidden、
 * setDisplay、clearForProfile 和 reset。
 *
 * store 不持久化（无 persist middleware），刷新页面即重置。
 */
function makeState(
  displayByProfile: HomeTrendCardState['displayByProfile'] = {},
): HomeTrendCardState {
  return {
    displayByProfile,
    setDisplay: () => {},
    clearForProfile: () => {},
    reset: () => {},
  };
}

describe('home-trend-card store', () => {
  beforeEach(() => {
    useHomeTrendCardStore.setState({
      displayByProfile: {},
    });
  });

  describe('selectHomeTrendCardDisplay', () => {
    it('未知 profile 返回 hidden', () => {
      expect(
        selectHomeTrendCardDisplay(makeState(), 'profile-unknown'),
      ).toBe('hidden');
    });

    it('已知 profile 返回 store 中的状态', () => {
      const state = makeState({ 'profile-a': 'sleep' });
      expect(selectHomeTrendCardDisplay(state, 'profile-a')).toBe('sleep');
    });
  });

  describe('setDisplay', () => {
    it('把 hidden 切换为 sleep', () => {
      useHomeTrendCardStore.getState().setDisplay('profile-a', 'sleep');
      expect(
        selectHomeTrendCardDisplay(
          useHomeTrendCardStore.getState(),
          'profile-a',
        ),
      ).toBe('sleep');
    });

    it('支持切换到 activity 和 hidden', () => {
      const { setDisplay } = useHomeTrendCardStore.getState();
      setDisplay('profile-a', 'activity');
      expect(
        selectHomeTrendCardDisplay(
          useHomeTrendCardStore.getState(),
          'profile-a',
        ),
      ).toBe('activity');

      setDisplay('profile-a', 'hidden');
      expect(
        selectHomeTrendCardDisplay(
          useHomeTrendCardStore.getState(),
          'profile-a',
        ),
      ).toBe('hidden');
    });

    it('更新产生新的 displayByProfile 引用（不可变）', () => {
      const before = useHomeTrendCardStore.getState().displayByProfile;
      useHomeTrendCardStore.getState().setDisplay('profile-a', 'sleep');
      const after = useHomeTrendCardStore.getState().displayByProfile;
      expect(after).not.toBe(before);
    });
  });

  describe('profile 隔离', () => {
    it('A 切换不影响 B', () => {
      const { setDisplay } = useHomeTrendCardStore.getState();
      setDisplay('profile-a', 'sleep');
      setDisplay('profile-b', 'activity');

      const state = useHomeTrendCardStore.getState();
      expect(selectHomeTrendCardDisplay(state, 'profile-a')).toBe('sleep');
      expect(selectHomeTrendCardDisplay(state, 'profile-b')).toBe('activity');
    });

    it('A 二次切换不影响 B', () => {
      const { setDisplay } = useHomeTrendCardStore.getState();
      setDisplay('profile-a', 'sleep');
      setDisplay('profile-b', 'activity');

      setDisplay('profile-a', 'hidden');

      const state = useHomeTrendCardStore.getState();
      expect(selectHomeTrendCardDisplay(state, 'profile-a')).toBe('hidden');
      expect(selectHomeTrendCardDisplay(state, 'profile-b')).toBe('activity');
    });
  });

  describe('clearForProfile', () => {
    it('清除指定 profile 不影响其他 profile', () => {
      const { setDisplay, clearForProfile } = useHomeTrendCardStore.getState();
      setDisplay('profile-a', 'sleep');
      setDisplay('profile-b', 'activity');

      clearForProfile('profile-a');

      const state = useHomeTrendCardStore.getState();
      expect(selectHomeTrendCardDisplay(state, 'profile-a')).toBe('hidden');
      expect(selectHomeTrendCardDisplay(state, 'profile-b')).toBe('activity');
    });
  });

  describe('reset', () => {
    it('清空所有 profile 状态回到默认 hidden', () => {
      const { setDisplay, reset } = useHomeTrendCardStore.getState();
      setDisplay('profile-a', 'sleep');
      setDisplay('profile-b', 'activity');

      reset();

      const state = useHomeTrendCardStore.getState();
      expect(selectHomeTrendCardDisplay(state, 'profile-a')).toBe('hidden');
      expect(selectHomeTrendCardDisplay(state, 'profile-b')).toBe('hidden');
      expect(state.displayByProfile).toEqual({});
    });
  });
});
