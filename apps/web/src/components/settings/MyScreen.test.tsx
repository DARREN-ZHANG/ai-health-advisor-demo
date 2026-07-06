import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MyScreen } from './MyScreen';
import { useProfileStore } from '@/stores/profile.store';
import type { ProfileSummary } from '@/hooks/use-profiles-query';

/**
 * MyScreen 单元测试。
 *
 * Mock 策略：
 * - `@/lib/api-client`：拦截 GET /profiles。
 * - `@/hooks/use-god-mode-actions`：默认空 mock（AccountSwitcherSheet 在 MyScreen 集成中
 *   只验证可打开，不验证切换流程本身，那部分由 AccountSwitcherSheet.test.tsx 覆盖）。
 *
 * 注意：MyScreen 的 Language 行会调用 window.location.reload，测试中需 stub。
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

const MESSAGES = {
  my: {
    title: '我的',
    currentProfileLabel: '当前 Profile',
    disabledHint: '演示版本暂不开放',
    openAccountSwitcher: '切换账户',
    openLanguageSwitcher: '切换语言',
    section: {
      account: '账户',
      language: '语言',
      settings: '设置',
      notifications: '通知',
      help: '帮助',
      about: '关于',
      logout: '退出登录',
    },
  },
  accountSwitcher: {
    title: '切换账户',
    legend: '选择一个 Profile',
    loading: '正在加载 Profile...',
    empty: '暂无可用 Profile',
    switchFailed: '切换 Profile 失败',
  },
} as const;

const PROFILES: ProfileSummary[] = [
  { profileId: 'profile-a', name: 'Account A', age: 30, gender: 'male', recordCount: 10 },
  { profileId: 'profile-b', name: 'Account B', age: 28, gender: 'female', recordCount: 8 },
];

function buildWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="zh" messages={MESSAGES}>
          {children}
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
  }
  return { Wrapper, queryClient };
}

function renderScreen() {
  const { Wrapper } = buildWrapper();
  return render(
    <Wrapper>
      <MyScreen />
    </Wrapper>,
  );
}

describe('MyScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProfileStore.setState({ currentProfileId: 'profile-a', currentProfile: null });
    // stub reload 防止 jsdom 抛错
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: vi.fn() },
      writable: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('渲染页面标题与所有菜单项文案', async () => {
    const { apiClient } = await import('@/lib/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(PROFILES);

    renderScreen();

    expect(screen.getByText('我的')).toBeInTheDocument();
    // Account + Language 必出
    expect(screen.getByText('账户')).toBeInTheDocument();
    expect(screen.getByText('语言')).toBeInTheDocument();
    // 4 个 disabled 项
    expect(screen.getByText('设置')).toBeInTheDocument();
    expect(screen.getByText('通知')).toBeInTheDocument();
    expect(screen.getByText('帮助')).toBeInTheDocument();
    expect(screen.getByText('关于')).toBeInTheDocument();
    expect(screen.getByText('退出登录')).toBeInTheDocument();
    // 演示版本提示
    expect(screen.getByText('演示版本暂不开放')).toBeInTheDocument();
  });

  it('渲染当前 Profile 名称', async () => {
    const { apiClient } = await import('@/lib/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(PROFILES);

    renderScreen();

    await waitFor(() => {
      expect(screen.getByText('Account A')).toBeInTheDocument();
    });
  });

  it('Account 行点击打开 AccountSwitcherSheet 弹窗', async () => {
    const { apiClient } = await import('@/lib/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(PROFILES);

    renderScreen();

    // 默认未开
    expect(screen.queryByRole('dialog')).toBeNull();

    const accountButton = screen.getByRole('button', { name: '切换账户' });
    fireEvent.click(accountButton);

    await waitFor(() => {
      expect(screen.getAllByRole('dialog').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('Language 行点击触发 reload 切换语言', async () => {
    const { apiClient } = await import('@/lib/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(PROFILES);

    renderScreen();

    const langButton = screen.getByRole('button', { name: '切换语言' });
    fireEvent.click(langButton);

    expect(window.localStorage.getItem('lang')).toBe('en');
    expect(window.location.reload).toHaveBeenCalled();
  });

  it('disabled 行都有 aria-disabled=true', async () => {
    const { apiClient } = await import('@/lib/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(PROFILES);

    renderScreen();

    const disabledRows = document.querySelectorAll('[data-valo-disabled="true"]');
    // 5 个 disabled 项（settings / notifications / help / about / logout）
    expect(disabledRows.length).toBe(5);
    for (const row of disabledRows) {
      expect(row.getAttribute('aria-disabled')).toBe('true');
      expect(row.getAttribute('disabled')).toBe(''); // <button disabled>
    }
  });

  it('disabled 行点击不触发任何弹窗', async () => {
    const { apiClient } = await import('@/lib/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(PROFILES);

    renderScreen();

    const settingsRow = document.querySelector('[data-valo-my="settings"]');
    expect(settingsRow).not.toBeNull();
    fireEvent.click(settingsRow!);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Account / Language 行不是 disabled', async () => {
    const { apiClient } = await import('@/lib/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(PROFILES);

    renderScreen();

    const accountRow = document.querySelector('[data-valo-my="account"]');
    const languageRow = document.querySelector('[data-valo-my="language"]');
    expect(accountRow?.getAttribute('data-valo-disabled')).toBe('false');
    expect(accountRow?.hasAttribute('disabled')).toBe(false);
    expect(languageRow?.getAttribute('data-valo-disabled')).toBe('false');
    expect(languageRow?.hasAttribute('disabled')).toBe(false);
  });

  it('当前 Profile 头部显示首字母 avatar', async () => {
    const { apiClient } = await import('@/lib/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(PROFILES);

    renderScreen();

    await waitFor(() => {
      const avatar = document.querySelector('[data-valo-avatar-current="true"]');
      expect(avatar).not.toBeNull();
      expect(avatar?.textContent).toBe('AA');
    });
  });

  it('profile 列表加载失败时，头部回退显示 profileId 作为名称', async () => {
    const { apiClient } = await import('@/lib/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));

    renderScreen();

    await waitFor(() => {
      const nameNode = document.querySelector('[data-valo-my="current-profile-name"]');
      expect(nameNode?.textContent).toBe('profile-a');
    });
  });

  it('Language 行展示当前 locale 作为 trailing', async () => {
    const { apiClient } = await import('@/lib/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(PROFILES);

    renderScreen();

    const localeNode = document.querySelector('[data-valo-my="current-locale"]');
    expect(localeNode?.textContent).toBe('zh');
  });

  it('根元素带 data-valo-my=root', async () => {
    const { apiClient } = await import('@/lib/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(PROFILES);

    renderScreen();

    expect(document.querySelector('[data-valo-my="root"]')).not.toBeNull();
  });
});
