import { beforeEach, describe, expect, it, vi } from 'vitest';

const useGodModeStore = vi.fn();
const useGodModeState = vi.fn();
const useGodModeActions = vi.fn();
const useProfileStore = vi.fn();

vi.mock('@/stores/god-mode.store', () => ({
  useGodModeStore,
}));

vi.mock('@/hooks/use-god-mode-actions', () => ({
  useGodModeState,
  useGodModeActions,
}));

vi.mock('@/stores/profile.store', () => ({
  useProfileStore,
}));

vi.mock('@health-advisor/ui', () => ({
  Drawer: ({ children }: { children: unknown }) => children,
  Button: ({ children }: { children: unknown }) => children,
  Section: ({ children }: { children: unknown }) => children,
  Skeleton: () => null,
}));

describe('GodModePanel', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('禁用 God-Mode 时不触发状态查询', async () => {
    useGodModeStore.mockReturnValue({ isEnabled: false });

    const { GodModePanel } = await import('./GodModePanel');
    const panel = GodModePanel();

    expect(panel).toBeNull();
    expect(useGodModeState).not.toHaveBeenCalled();
    expect(useGodModeActions).not.toHaveBeenCalled();
    expect(useProfileStore).not.toHaveBeenCalled();
  });
});
