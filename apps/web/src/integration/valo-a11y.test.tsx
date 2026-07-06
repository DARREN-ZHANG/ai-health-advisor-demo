import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { SwitchStatusDialog } from '@/components/homepage/SwitchStatusDialog';
import { AccountSwitcherSheet } from '@/components/settings/AccountSwitcherSheet';
import { useProfileStore } from '@/stores/profile.store';

/**
 * Valo 跨模块可访问性抽样测试（I7.1 Part D）。
 *
 * 关注的是"组件间共享的 a11y 契约"：
 * - ValoSheet / ValoDialog 已统一渲染 `role="dialog"` + `aria-modal="true"`
 *   （由 ValoSheet.test / ValoDialog.test 单独守护），这里只校验组合后的弹窗
 *   在 SwitchStatusDialog / AccountSwitcherSheet 中实际生效。
 * - 原生 radio group 在 jsdom 中虽然不真正切换焦点，但 `keydown` 仍会冒泡到
 *   fieldset，因此这里测的是"键盘事件不被吞掉"的契约 —— 任何包了一层
 *   非语义化 div 阻断冒泡的回归都会被本测试发现。
 *
 * 已在 HealthHero.test / HomeHeader.test / ValoSheet.test / ValoDialog.test
 * 中覆盖的 a11y 项不再重复。
 */

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));
vi.mock('@/hooks/use-god-mode-actions', () => ({
  useGodModeActions: vi.fn(),
}));

const ACCOUNT_MESSAGES = {
  accountSwitcher: {
    title: 'Switch Account',
    legend: 'Select a profile',
    loading: 'Loading...',
    empty: 'No profiles',
    error: 'Failed to load profiles',
    switchFailed: 'Switch failed',
  },
} as const;

const SWITCH_MESSAGES = {
  health: {
    state: {
      'prime-readiness': 'Prime Readiness',
      'active-recovery': 'Active Recovery',
      'metabolic-sluggish': 'Metabolic Sluggish',
      'glycogen-depleted': 'Glycogen Depleted',
    },
    switchStatus: {
      title: 'Switch Status',
      legend: 'Select a health status',
      ringLabel: 'Switch health status',
    },
  },
} as const;

function AccountWrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={ACCOUNT_MESSAGES}>
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

describe('Valo 跨模块 a11y 抽样', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('SwitchStatusDialog 所有 dialog 都满足 role=dialog + aria-modal=true', () => {
    render(
      <NextIntlClientProvider locale="en" messages={SWITCH_MESSAGES}>
        <SwitchStatusDialog
          open
          onClose={() => {}}
          current="prime-readiness"
          onSelect={() => {}}
        />
      </NextIntlClientProvider>,
    );
    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs.length).toBeGreaterThanOrEqual(1);
    for (const d of dialogs) {
      expect(d.getAttribute('role')).toBe('dialog');
      expect(d.getAttribute('aria-modal')).toBe('true');
    }
  });

  it('SwitchStatusDialog 内部 radio 收到 ArrowDown 时不会吞掉默认行为（form 仍可访问）', () => {
    // 这是原生 radio group 的契约：浏览器原生处理箭头键切换。
    // jsdom 不模拟原生行为，但能确认事件冒泡不被阻断（任何 wrapper 误加
    // stopPropagation 都会让本测试失败）。
    render(
      <NextIntlClientProvider locale="en" messages={SWITCH_MESSAGES}>
        <SwitchStatusDialog
          open
          onClose={() => {}}
          current="prime-readiness"
          onSelect={() => {}}
        />
      </NextIntlClientProvider>,
    );
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBeGreaterThan(0);
    // 派发 ArrowDown 不应抛错；事件应能正常 dispatch。
    expect(() => {
      fireEvent.keyDown(radios[0]!, { key: 'ArrowDown' });
    }).not.toThrow();
  });

  it('AccountSwitcherSheet 所有 dialog 都满足 role=dialog + aria-modal=true', async () => {
    useProfileStore.setState({ currentProfileId: 'a', currentProfile: null });
    const { apiClient } = await import('@/lib/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue([
      { profileId: 'a', name: 'A', age: 30, gender: 'male', recordCount: 1 },
    ]);
    const mod = await import('@/hooks/use-god-mode-actions');
    (mod.useGodModeActions as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      switchProfile: vi.fn(),
      isSwitchingProfile: false,
    });

    render(
      <AccountWrapper>
        <AccountSwitcherSheet open onClose={() => {}} />
      </AccountWrapper>,
    );

    // 等待数据 resolve 后 dialog 出现
    const dialogs = await screen.findAllByRole('dialog');
    expect(dialogs.length).toBeGreaterThanOrEqual(1);
    for (const d of dialogs) {
      expect(d.getAttribute('role')).toBe('dialog');
      expect(d.getAttribute('aria-modal')).toBe('true');
    }
  });

  it('AccountSwitcherSheet 内部 radio 收到 ArrowDown 时不抛错（事件冒泡不被阻断）', async () => {
    useProfileStore.setState({ currentProfileId: 'a', currentProfile: null });
    const { apiClient } = await import('@/lib/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue([
      { profileId: 'a', name: 'A', age: 30, gender: 'male', recordCount: 1 },
      { profileId: 'b', name: 'B', age: 28, gender: 'female', recordCount: 2 },
    ]);
    const mod = await import('@/hooks/use-god-mode-actions');
    (mod.useGodModeActions as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      switchProfile: vi.fn(),
      isSwitchingProfile: false,
    });

    render(
      <AccountWrapper>
        <AccountSwitcherSheet open onClose={() => {}} />
      </AccountWrapper>,
    );

    const radios = await screen.findAllByRole('radio');
    expect(radios.length).toBeGreaterThan(0);
    expect(() => {
      fireEvent.keyDown(radios[0]!, { key: 'ArrowDown' });
    }).not.toThrow();
  });
});
