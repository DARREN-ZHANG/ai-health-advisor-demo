import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { HomeTrendCardSlot } from './HomeTrendCardSlot';
import { HomepageIntlProvider } from './intl-test-helper';
import {
  selectHomeTrendCardDisplay,
  useHomeTrendCardStore,
} from '@/stores/home-trend-card.store';

function renderWithIntl(node: React.ReactNode) {
  return render(<HomepageIntlProvider>{node}</HomepageIntlProvider>);
}

describe('HomeTrendCardSlot', () => {
  beforeEach(() => {
    useHomeTrendCardStore.setState({ displayByProfile: {} });
  });

  afterEach(() => cleanup());

  it('未提供 profileId 时不渲染卡片', () => {
    const { container } = renderWithIntl(<HomeTrendCardSlot profileId={undefined} />);
    expect(container.querySelector('[data-valo-home-trend-card]')).toBeNull();
  });

  it('未知 profile（默认 hidden）不渲染卡片', () => {
    const { container } = renderWithIntl(<HomeTrendCardSlot profileId="profile-a" />);
    expect(container.querySelector('[data-valo-home-trend-card]')).toBeNull();
  });

  it('store 切到 sleep 后渲染 Sleep 卡片', () => {
    useHomeTrendCardStore.getState().setDisplay('profile-a', 'sleep');
    const { container } = renderWithIntl(<HomeTrendCardSlot profileId="profile-a" />);
    const node = container.querySelector('[data-valo-home-trend-card="sleep"]');
    expect(node).not.toBeNull();
  });

  it('store 从 sleep 切到 activity 后内容替换', async () => {
    useHomeTrendCardStore.getState().setDisplay('profile-a', 'sleep');
    const { container } = renderWithIntl(
      <HomeTrendCardSlot profileId="profile-a" />,
    );
    expect(container.querySelector('[data-valo-home-trend-card="sleep"]')).not.toBeNull();

    useHomeTrendCardStore.getState().setDisplay('profile-a', 'activity');

    // AnimatePresence 用 key 切换；等待 activity 元素出现即可（exit 动画在 jsdom 中几乎瞬时完成）
    await waitFor(() => {
      expect(
        container.querySelector('[data-valo-home-trend-card="activity"]'),
      ).not.toBeNull();
    });
  });

  it('store 切回 hidden 后 DOM 移除', async () => {
    useHomeTrendCardStore.getState().setDisplay('profile-a', 'sleep');
    const { container } = renderWithIntl(
      <HomeTrendCardSlot profileId="profile-a" />,
    );
    expect(container.querySelector('[data-valo-home-trend-card]')).not.toBeNull();

    useHomeTrendCardStore.getState().setDisplay('profile-a', 'hidden');

    await waitFor(() => {
      expect(container.querySelector('[data-valo-home-trend-card]')).toBeNull();
    });
  });

  it('响应 store 切换的 selector 链路（不依赖内部实现）', () => {
    renderWithIntl(<HomeTrendCardSlot profileId="profile-a" />);
    useHomeTrendCardStore.getState().setDisplay('profile-a', 'activity');
    expect(
      selectHomeTrendCardDisplay(useHomeTrendCardStore.getState(), 'profile-a'),
    ).toBe('activity');
  });
});
