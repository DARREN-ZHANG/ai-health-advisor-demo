import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AIAdvisorTrigger } from './AIAdvisorTrigger';
import { AdvisorIntlProvider } from './intl-test-helper';
import { useUIStore } from '@/stores/ui.store';

function renderWithIntl(node: React.ReactNode) {
  return render(<AdvisorIntlProvider>{node}</AdvisorIntlProvider>);
}

describe('AIAdvisorTrigger', () => {
  beforeEach(() => {
    useUIStore.setState({ isAdvisorDrawerOpen: false });
  });

  afterEach(() => {
    cleanup();
    useUIStore.setState({ isAdvisorDrawerOpen: false });
  });

  it('drawer 关闭时渲染入口按钮', () => {
    renderWithIntl(<AIAdvisorTrigger />);
    expect(
      screen.getByRole('button', { name: '打开 AI 顾问' }),
    ).toBeInTheDocument();
  });

  it('drawer 打开时不渲染（避免与遮罩叠加）', () => {
    useUIStore.setState({ isAdvisorDrawerOpen: true });
    renderWithIntl(<AIAdvisorTrigger />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('点击触发 toggleAdvisorDrawer(true)', () => {
    const toggleSpy = vi.spyOn(useUIStore.getState(), 'toggleAdvisorDrawer');
    renderWithIntl(<AIAdvisorTrigger />);
    fireEvent.click(screen.getByRole('button'));
    expect(toggleSpy).toHaveBeenCalledWith(true);
    toggleSpy.mockRestore();
  });

  it('携带 data-valo-touch="true" 以获得 40px 最小触摸目标保证', () => {
    renderWithIntl(<AIAdvisorTrigger />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('data-valo-touch')).toBe('true');
  });

  it('按钮为 64px 圆形（h-16 w-16 rounded-full）', () => {
    renderWithIntl(<AIAdvisorTrigger />);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('w-16');
    expect(btn.className).toContain('h-16');
    expect(btn.className).toContain('rounded-full');
  });

  it('外层定位 fixed 到 Valo app 画布右侧，而不是 viewport 右下角', () => {
    renderWithIntl(<AIAdvisorTrigger />);
    const wrapper = document.querySelector(
      '[data-valo-advisor-trigger="true"]',
    ) as HTMLElement | null;
    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).toContain('fixed');
    expect(wrapper?.className).toContain('bottom-[25px]');
    expect(wrapper?.className).toContain('z-40');
    const style = wrapper?.getAttribute('style') ?? '';
    expect(style).toContain('right: max(16px');
    expect(style).toContain('100vw - 430px');
    expect(style).toContain('36px');
  });

  it('主操作背景引用 --valo-prime（不再使用 bg-blue-600 等散落颜色）', () => {
    renderWithIntl(<AIAdvisorTrigger />);
    const btn = screen.getByRole('button');
    const style = btn.getAttribute('style') ?? '';
    expect(style).toContain('var(--valo-prime)');
    // 旧实现使用 bg-blue-600 / shadow-blue-500/40 等散落类，重构后必须消失。
    expect(btn.className).not.toContain('bg-blue-600');
    expect(btn.className).not.toContain('bg-blue-500');
    expect(btn.className).not.toContain('shadow-blue');
  });

  it('渲染 Figma 风格聊天模式 glyph，不再使用绿色在线点', () => {
    renderWithIntl(<AIAdvisorTrigger />);
    const btn = screen.getByRole('button');
    expect(btn.querySelector('[data-valo-chat-mode-glyph="true"]')).not.toBeNull();
    expect(btn.querySelector('span')).toBeNull();
  });
});
