import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccountSwitcherSheet } from './AccountSwitcherSheet';
import { useProfileStore } from '@/stores/profile.store';
import { useUIStore } from '@/stores/ui.store';
import type { ProfileSummary } from '@/hooks/use-profiles-query';

/**
 * AccountSwitcherSheet 单元测试。
 *
 * Mock 策略：
 * - `@/lib/api-client`：拦截 GET /profiles。
 * - `@/hooks/use-god-mode-actions`：拦截 switchProfile，提供 spy。
 * - 真实使用 `useProfileStore` 与 `useUIStore`，验证与 store 的契约。
 */

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('@/hooks/use-god-mode-actions', () => ({
  useGodModeActions: vi.fn(),
}));

const MESSAGES = {
  accountSwitcher: {
    title: '切换账户',
    legend: '选择一个 Profile',
    loading: '正在加载 Profile...',
    empty: '暂无可用 Profile',
    error: '加载 Profile 失败',
    switchFailed: '切换 Profile 失败',
  },
} as const;

const PROFILES: ProfileSummary[] = [
  {
    profileId: 'profile-a',
    name: 'Account A',
    avatar: 'avatar-1.png',
    age: 30,
    gender: 'male',
    recordCount: 10,
  },
  {
    profileId: 'profile-b',
    name: 'Account B',
    avatar: 'avatar-2.png',
    age: 28,
    gender: 'female',
    recordCount: 8,
  },
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

function renderSheet(node: ReactNode) {
  const { Wrapper } = buildWrapper();
  return render(<Wrapper>{node}</Wrapper>);
}

async function mockProfilesResponse(profiles: ProfileSummary[]) {
  const { apiClient } = await import('@/lib/api-client');
  (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(profiles);
}

async function mockProfilesFailure() {
  const { apiClient } = await import('@/lib/api-client');
  (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
}

async function mockActions(overrides: {
  switchProfile?: ReturnType<typeof vi.fn>;
  isSwitchingProfile?: boolean;
}) {
  const mod = await import('@/hooks/use-god-mode-actions');
  (mod.useGodModeActions as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    switchProfile: overrides.switchProfile ?? vi.fn(),
    isSwitchingProfile: overrides.isSwitchingProfile ?? false,
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
  });
}

describe('AccountSwitcherSheet', () => {
  beforeEach(() => {
    useProfileStore.setState({ currentProfileId: 'profile-a', currentProfile: null });
    useUIStore.setState({ toasts: [] });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('open=false 时不渲染任何弹窗', () => {
    renderSheet(<AccountSwitcherSheet open={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('open=true 时同时挂载移动端与桌面端两份弹窗（dual-render）', async () => {
    await mockProfilesResponse(PROFILES);
    await mockActions({});
    renderSheet(<AccountSwitcherSheet open onClose={() => {}} />);
    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs.length).toBeGreaterThanOrEqual(2);
  });

  it('加载中显示 loading 文案', async () => {
    // 让 query 永远 pending（不 resolve）
    const { apiClient } = await import('@/lib/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    );
    await mockActions({});

    renderSheet(<AccountSwitcherSheet open onClose={() => {}} />);
    const loadingTexts = await screen.findAllByText('正在加载 Profile...');
    expect(loadingTexts.length).toBeGreaterThanOrEqual(1);
  });

  it('成功加载 Profile 列表，每个视口渲染所有 Profile radio', async () => {
    await mockProfilesResponse(PROFILES);
    await mockActions({});
    renderSheet(<AccountSwitcherSheet open onClose={() => {}} />);

    await waitFor(() => {
      const radios = screen.getAllByRole('radio');
      // 2 个 profile × 2 视口 = 4
      expect(radios).toHaveLength(4);
    });

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio.getAttribute('name')).toBe('profile');
    }
  });

  it('当前 profile 对应的 radio 为 checked', async () => {
    await mockProfilesResponse(PROFILES);
    await mockActions({});
    renderSheet(<AccountSwitcherSheet open onClose={() => {}} />);

    await waitFor(() => {
      const checkedRadios = screen.getAllByRole('radio').filter(
        (r) => r.getAttribute('checked') === '',
      );
      // 2 视口都标记
      expect(checkedRadios.length).toBeGreaterThanOrEqual(1);
      for (const r of checkedRadios) {
        expect(r.getAttribute('value')).toBe('profile-a');
      }
    });
  });

  it('选择新 profile 调用 switchProfile 并关闭弹窗', async () => {
    await mockProfilesResponse(PROFILES);
    const switchProfile = vi.fn().mockResolvedValue(undefined);
    await mockActions({ switchProfile });
    const onClose = vi.fn();
    renderSheet(<AccountSwitcherSheet open onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getAllByRole('radio').length).toBeGreaterThan(0);
    });

    // 点击 profile-b 的某个 radio（两个视口任一都可触发）
    const radioB = screen
      .getAllByRole('radio')
      .find((r) => r.getAttribute('value') === 'profile-b');
    expect(radioB).toBeDefined();
    fireEvent.click(radioB!);

    await waitFor(() => expect(switchProfile).toHaveBeenCalledWith('profile-b'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('点击当前已选 profile 不调用 switchProfile', async () => {
    await mockProfilesResponse(PROFILES);
    const switchProfile = vi.fn().mockResolvedValue(undefined);
    await mockActions({ switchProfile });
    renderSheet(<AccountSwitcherSheet open onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getAllByRole('radio').length).toBeGreaterThan(0);
    });

    const radioA = screen
      .getAllByRole('radio')
      .find((r) => r.getAttribute('value') === 'profile-a');
    fireEvent.click(radioA!);

    expect(switchProfile).not.toHaveBeenCalled();
  });

  it('切换失败时显示 error toast，不关闭弹窗', async () => {
    await mockProfilesResponse(PROFILES);
    const switchProfile = vi.fn().mockRejectedValue(new Error('boom'));
    await mockActions({ switchProfile });
    const onClose = vi.fn();
    renderSheet(<AccountSwitcherSheet open onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getAllByRole('radio').length).toBeGreaterThan(0);
    });

    const radioB = screen
      .getAllByRole('radio')
      .find((r) => r.getAttribute('value') === 'profile-b');
    fireEvent.click(radioB!);

    await waitFor(() => expect(switchProfile).toHaveBeenCalled());
    await waitFor(() => {
      const toasts = useUIStore.getState().toasts;
      expect(toasts.some((t) => t.message === '切换 Profile 失败' && t.type === 'error')).toBe(true);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('加载失败时显示错误状态文案（区别于空状态）', async () => {
    await mockProfilesFailure();
    await mockActions({});
    renderSheet(<AccountSwitcherSheet open onClose={() => {}} />);

    await waitFor(() => {
      const errorTexts = screen.getAllByText('加载 Profile 失败');
      expect(errorTexts.length).toBeGreaterThanOrEqual(1);
    });
    // 错误态与空态文案不应混淆
    expect(screen.queryByText('暂无可用 Profile')).toBeNull();
  });

  it('空列表显示空状态文案（与错误态分开）', async () => {
    await mockProfilesResponse([]);
    await mockActions({});
    renderSheet(<AccountSwitcherSheet open onClose={() => {}} />);

    await waitFor(() => {
      const emptyTexts = screen.getAllByText('暂无可用 Profile');
      expect(emptyTexts.length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.queryByText('加载 Profile 失败')).toBeNull();
  });

  it('每个 radio 标签包含 profile 名称', async () => {
    await mockProfilesResponse(PROFILES);
    await mockActions({});
    renderSheet(<AccountSwitcherSheet open onClose={() => {}} />);

    await waitFor(() => {
      // 每个名称至少出现一次（每个视口一次）
      const aNames = screen.getAllByText('Account A');
      const bNames = screen.getAllByText('Account B');
      expect(aNames.length).toBeGreaterThanOrEqual(1);
      expect(bNames.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('每个 profile 选项渲染基础信息中的头像', async () => {
    await mockProfilesResponse(PROFILES);
    await mockActions({});
    renderSheet(<AccountSwitcherSheet open onClose={() => {}} />);

    await waitFor(() => {
      const aAvatars = document.querySelectorAll('[data-valo-avatar-mini="profile-a"]');
      const bAvatars = document.querySelectorAll('[data-valo-avatar-mini="profile-b"]');
      // 每视口各一个，共 2
      expect(aAvatars.length).toBe(2);
      expect(bAvatars.length).toBe(2);
      expect(aAvatars[0]!.getAttribute('src')).toBe('/valo/images/avatar-1.png');
      expect(bAvatars[0]!.getAttribute('src')).toBe('/valo/images/avatar-2.png');
    });
  });
});
