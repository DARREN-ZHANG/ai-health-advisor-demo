import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DemoControlTrigger } from './DemoControlTrigger';
import { DemoControlIntlProvider } from './intl-test-helper';
import { useGodModeStore } from '@/stores/god-mode.store';

function renderWithIntl(node: React.ReactNode) {
  return render(<DemoControlIntlProvider>{node}</DemoControlIntlProvider>);
}

describe('DemoControlTrigger', () => {
  beforeEach(() => {
    // 每个用例独立设置 isEnabled / isOpen
    useGodModeStore.setState({ isEnabled: true, isOpen: false });
  });

  afterEach(() => {
    cleanup();
    useGodModeStore.setState({ isEnabled: false, isOpen: false });
  });

  it('isEnabled=true 时渲染入口按钮', () => {
    renderWithIntl(<DemoControlTrigger />);
    expect(
      screen.getByRole('button', { name: '打开 Demo 控制' }),
    ).toBeInTheDocument();
  });

  it('isEnabled=false 时不渲染', () => {
    useGodModeStore.setState({ isEnabled: false });
    renderWithIntl(<DemoControlTrigger />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('点击触发 toggleOpen', () => {
    const toggleSpy = vi.spyOn(useGodModeStore.getState(), 'toggleOpen');
    renderWithIntl(<DemoControlTrigger />);
    fireEvent.click(screen.getByRole('button'));
    expect(toggleSpy).toHaveBeenCalledTimes(1);
    toggleSpy.mockRestore();
  });

  it('携带 aria-haspopup、aria-expanded、aria-controls 三项可访问性属性', () => {
    renderWithIntl(<DemoControlTrigger />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-haspopup')).toBe('dialog');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.getAttribute('aria-controls')).toBe('demo-control-drawer');
  });

  it('isOpen=true 时 aria-expanded=true', () => {
    useGodModeStore.setState({ isOpen: true });
    renderWithIntl(<DemoControlTrigger />);
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true');
  });

  it('包含紫色脉冲点（引用 --valo-prime）', () => {
    const { container } = renderWithIntl(<DemoControlTrigger />);
    // 至少存在一个引用 --valo-prime 背景的 span
    const primeNodes = container.querySelectorAll(
      '[class*="bg-[var(--valo-prime)]"]',
    );
    expect(primeNodes.length).toBeGreaterThan(0);
  });

  it('满足最小触达：data-valo-touch=true', () => {
    renderWithIntl(<DemoControlTrigger />);
    expect(
      screen.getByRole('button').getAttribute('data-valo-touch'),
    ).toBe('true');
  });

  it('使用 AdjustmentsHorizontalIcon 图标（视觉锚点）', () => {
    const { container } = renderWithIntl(<DemoControlTrigger />);
    // heroicons 渲染为 svg，且为按钮内唯一图标
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    // 不含 animate-spin（脉冲点用 animate-ping，区别于 loading 旋转）
    expect(container.querySelector('.animate-spin')).toBeNull();
  });
});
