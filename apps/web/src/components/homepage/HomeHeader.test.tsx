import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HomeHeader } from './HomeHeader';
import { HomepageIntlProvider } from './intl-test-helper';
import { useGodModeStore } from '@/stores/god-mode.store';
import { useUIStore } from '@/stores/ui.store';

/**
 * HomeHeader 测试。
 *
 * I6.1 起，Avatar 不再弹"即将上线"toast，而是打开 `<AccountSwitcherSheet>`。
 * 测试用 QueryClientProvider + HomepageIntlProvider 包装，并对 `@/lib/api-client`
 * 与 `@/hooks/use-god-mode-actions` 进行 mock。
 *
 * AccountSwitcherSheet 自身的开关 / radio / 切换流程由它自己的测试文件覆盖；
 * 这里只验证 Avatar → Sheet 的接线。
 */

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('@/hooks/use-god-mode-actions', () => ({
  useGodModeActions: vi.fn(() => ({
    switchProfile: vi.fn(),
    isSwitchingProfile: false,
    injectEvent: vi.fn(),
    isInjectingEvent: false,
    appendTimeline: vi.fn(),
    isAppendingTimeline: false,
    advanceClock: vi.fn(),
    isAdvancingClock: false,
    resetTimeline: vi.fn(),
    isResettingTimeline: false,
    appendMicroEvent: vi.fn(),
    isAppendingMicroEvent: false,
  })),
}));

function renderWithIntl(node: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <HomepageIntlProvider>{node}</HomepageIntlProvider>
    </QueryClientProvider>,
  );
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
    vi.clearAllMocks();
    useGodModeStore.setState({ isEnabled: false, isOpen: false });
  });

  it('渲染 Avatar 入口按钮', () => {
    renderWithIntl(<HomeHeader />);
    expect(
      screen.getByRole('button', { name: '切换账户' }),
    ).toBeInTheDocument();
  });

  it('Avatar 点击打开 AccountSwitcherSheet（弹出 dialog）', async () => {
    const { apiClient } = await import('@/lib/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue([
      { profileId: 'profile-a', name: 'Account A', avatar: 'avatar-1.png', age: 30, gender: 'male', recordCount: 1 },
    ]);

    renderWithIntl(<HomeHeader />);
    // 默认未开
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: '切换账户' }),
    );

    await waitFor(() => {
      expect(screen.getAllByRole('dialog').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('Avatar 打开 Sheet 时 aria-expanded 切到 true', async () => {
    const { apiClient } = await import('@/lib/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    renderWithIntl(<HomeHeader />);
    const avatar = screen.getByRole('button', { name: '切换账户' });
    expect(avatar.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(avatar);

    await waitFor(() => {
      expect(avatar.getAttribute('aria-expanded')).toBe('true');
    });
  });

  it('Avatar 点击不再触发占位 toast（行为已替换为打开 Sheet）', async () => {
    const { apiClient } = await import('@/lib/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    renderWithIntl(<HomeHeader />);
    fireEvent.click(
      screen.getByRole('button', { name: '切换账户' }),
    );
    expect(useUIStore.getState().toasts).toHaveLength(0);
  });

  it('onAvatarClick 覆盖默认 Sheet 行为', () => {
    const onAvatar = vi.fn();
    renderWithIntl(<HomeHeader onAvatarClick={onAvatar} />);
    fireEvent.click(
      screen.getByRole('button', { name: '切换账户' }),
    );
    expect(onAvatar).toHaveBeenCalledTimes(1);
    // 自定义回调时不应打开 Sheet
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Avatar 是 button，带 aria-haspopup=dialog', () => {
    renderWithIntl(<HomeHeader />);
    const avatar = screen.getByRole('button', { name: '切换账户' });
    expect(avatar.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('Avatar 满足最小触达：data-valo-touch=true', () => {
    renderWithIntl(<HomeHeader />);
    const avatar = screen.getByRole('button', { name: '切换账户' });
    expect(avatar.getAttribute('data-valo-touch')).toBe('true');
  });

  it('God Mode 启用时渲染 DemoControlTrigger', () => {
    useGodModeStore.setState({ isEnabled: true, isOpen: false });
    renderWithIntl(<HomeHeader />);
    // Avatar + DemoControlTrigger = 2 个按钮
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(2);
    expect(
      screen.getByRole('button', { name: '切换账户' }),
    ).toBeInTheDocument();
  });

  it('header 根元素带 data-valo-header=home', () => {
    renderWithIntl(<HomeHeader />);
    const header = document.querySelector('[data-valo-header="home"]');
    expect(header).not.toBeNull();
  });

  it('Header 紧贴页面顶部，不保留顶部空白', () => {
    renderWithIntl(<HomeHeader />);
    const shell = document.querySelector('[data-valo-header-shell="home"]');
    const header = document.querySelector('[data-valo-header="home"]');

    expect(shell?.className).toContain('h-10');
    expect(header?.className).not.toContain('top-[');
    expect(header?.className).not.toContain('absolute');
  });
});
