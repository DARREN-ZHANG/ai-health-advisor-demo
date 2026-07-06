import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { HomeHeader } from './HomeHeader';
import { HomepageIntlProvider } from './intl-test-helper';
import { useGodModeStore } from '@/stores/god-mode.store';
import { useUIStore } from '@/stores/ui.store';

function renderWithIntl(node: React.ReactNode) {
  return render(<HomepageIntlProvider>{node}</HomepageIntlProvider>);
}

describe('HomeHeader', () => {
  beforeEach(() => {
    // God Mode 关闭：DemoControlTrigger 默认不渲染
    useGodModeStore.setState({ isEnabled: false, isOpen: false });
    // 清空 toasts
    useUIStore.setState({ toasts: [] });
  });

  afterEach(() => {
    cleanup();
    useGodModeStore.setState({ isEnabled: false, isOpen: false });
  });

  it('渲染 Avatar 占位按钮', () => {
    renderWithIntl(<HomeHeader />);
    expect(
      screen.getByRole('button', { name: '账户切换（即将上线）' }),
    ).toBeInTheDocument();
  });

  it('Avatar 点击触发"即将上线" toast（不打开任何弹窗）', () => {
    renderWithIntl(<HomeHeader />);
    fireEvent.click(
      screen.getByRole('button', { name: '账户切换（即将上线）' }),
    );
    const toasts = useUIStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    const first = toasts[0];
    expect(first).toBeDefined();
    expect(first?.message).toBe('账户切换（即将上线）');
    expect(first?.type).toBe('info');
  });

  it('onAvatarClick 覆盖默认 toast 行为', () => {
    const onAvatar = vi.fn();
    renderWithIntl(<HomeHeader onAvatarClick={onAvatar} />);
    fireEvent.click(
      screen.getByRole('button', { name: '账户切换（即将上线）' }),
    );
    expect(onAvatar).toHaveBeenCalledTimes(1);
    // 自定义回调时不应弹默认 toast
    expect(useUIStore.getState().toasts).toHaveLength(0);
  });

  it('Avatar 是 button，带 aria-haspopup=dialog / aria-expanded=false', () => {
    renderWithIntl(<HomeHeader />);
    const avatar = screen.getByRole('button', { name: '账户切换（即将上线）' });
    expect(avatar.getAttribute('aria-haspopup')).toBe('dialog');
    expect(avatar.getAttribute('aria-expanded')).toBe('false');
  });

  it('Avatar 满足最小触达：data-valo-touch=true', () => {
    renderWithIntl(<HomeHeader />);
    const avatar = screen.getByRole('button', { name: '账户切换（即将上线）' });
    expect(avatar.getAttribute('data-valo-touch')).toBe('true');
  });

  it('Avatar 不打开 Switch Status（断言：页面没有第二个状态切换入口）', () => {
    renderWithIntl(<HomeHeader />);
    // HomeHeader 内只有 Avatar 一个按钮（DemoControlTrigger 在 God Mode 关时不渲染）
    expect(screen.getAllByRole('button')).toHaveLength(1);
    // 没有任何 dialog 出现
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('God Mode 启用时渲染 DemoControlTrigger', () => {
    useGodModeStore.setState({ isEnabled: true, isOpen: false });
    renderWithIntl(<HomeHeader />);
    // Avatar + DemoControlTrigger = 2 个按钮
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(2);
    expect(
      screen.getByRole('button', { name: '账户切换（即将上线）' }),
    ).toBeInTheDocument();
  });

  it('header 根元素带 data-valo-header=home', () => {
    renderWithIntl(<HomeHeader />);
    const header = document.querySelector('[data-valo-header="home"]');
    expect(header).not.toBeNull();
  });
});
