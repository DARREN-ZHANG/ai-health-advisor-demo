import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BottomNav } from './BottomNav';

/**
 * BottomNav 单元测试。
 *
 * I6.2 起，底部导航 IA 统一为 Home / Trends / My 三项；
 * 颜色全部走 var(--valo-*) token。
 */

const ZH_MESSAGES = {
  nav: {
    home: '首页',
    trends: '趋势',
    my: '我的',
  },
} as const;

// 默认 pathname 为首页；测试用 setPathname 切换。
let mockPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

function setPathname(p: string) {
  mockPathname = p;
}

function renderWithIntl(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="zh" messages={ZH_MESSAGES}>
      {node}
    </NextIntlClientProvider>,
  );
}

describe('BottomNav', () => {
  afterEach(() => {
    cleanup();
    setPathname('/');
    vi.clearAllMocks();
  });

  it('渲染三个导航项：Home / Trends / My', () => {
    renderWithIntl(<BottomNav />);
    const items = screen.getAllByRole('link');
    expect(items).toHaveLength(3);
    expect(screen.getByText('首页')).toBeInTheDocument();
    expect(screen.getByText('趋势')).toBeInTheDocument();
    expect(screen.getByText('我的')).toBeInTheDocument();
  });

  it('每项携带 data-valo-nav-item 标识，便于 E2E 定位', () => {
    renderWithIntl(<BottomNav />);
    expect(document.querySelector('[data-valo-nav-item="home"]')).not.toBeNull();
    expect(document.querySelector('[data-valo-nav-item="trends"]')).not.toBeNull();
    expect(document.querySelector('[data-valo-nav-item="my"]')).not.toBeNull();
  });

  it('根元素携带 data-valo-bottomnav 测试钩', () => {
    renderWithIntl(<BottomNav />);
    expect(document.querySelector('[data-valo-bottomnav="true"]')).not.toBeNull();
  });

  it('Home / Trends / My 链接指向正确路由', () => {
    renderWithIntl(<BottomNav />);
    const home = screen.getByText('首页').closest('a');
    const trends = screen.getByText('趋势').closest('a');
    const my = screen.getByText('我的').closest('a');
    expect(home?.getAttribute('href')).toBe('/');
    expect(trends?.getAttribute('href')).toBe('/data-center');
    expect(my?.getAttribute('href')).toBe('/my');
  });

  it('当前路由项加 aria-current=page', () => {
    setPathname('/my');
    renderWithIntl(<BottomNav />);
    const myLink = screen.getByText('我的').closest('a');
    expect(myLink?.getAttribute('aria-current')).toBe('page');
    const homeLink = screen.getByText('首页').closest('a');
    expect(homeLink?.getAttribute('aria-current')).toBeNull();
  });

  it('激活项文本颜色用 var(--valo-prime) token', () => {
    renderWithIntl(<BottomNav />);
    const homeLink = screen.getByText('首页').closest('a');
    expect(homeLink?.className).toContain('text-[var(--valo-prime)]');
  });

  it('未激活项文本颜色用 var(--valo-text-secondary) token', () => {
    setPathname('/my');
    renderWithIntl(<BottomNav />);
    const homeLink = screen.getByText('首页').closest('a');
    expect(homeLink?.className).toContain('text-[var(--valo-text-secondary)]');
  });

  it('导航根容器使用 Figma 风格胶囊定位与 token 化边框', () => {
    renderWithIntl(<BottomNav />);
    const nav = document.querySelector('[data-valo-bottomnav="true"]') as HTMLElement;
    const style = nav.getAttribute('style') ?? '';
    expect(style).toContain('left: max(18px');
    expect(style).toContain('50% - 178px');
    expect(style).toContain('var(--valo-border)');
    expect(nav.className).toContain('fixed');
    expect(nav.className).toContain('bottom-0');
    expect(nav.className).not.toContain('sticky');
    expect(nav.className).toContain('w-[276px]');
    expect(nav.className).toContain('rounded-[34px]');
    expect(nav.className).not.toContain('md:hidden');
    // safe-area 通过 globals.css 的 .valo-bottomnav-safe 钩子注入
    // （env() 内联值会被 React 过滤，改走 CSS 文件）
    expect(nav.className).toContain('valo-bottomnav-safe');
    // 全组件不出现 slate/blue 颜色字面量
    const html = document.body.innerHTML;
    expect(html).not.toMatch(/bg-slate-|text-blue-|bg-blue-/);
  });

  it('激活项使用 Figma 风格 rounded pill，而不是底部小圆点', () => {
    renderWithIntl(<BottomNav />);
    const homeLink = screen.getByText('首页').closest('a');
    expect(homeLink?.className).toContain('rounded-[28px]');
    expect(homeLink?.className).toContain('bg-[rgba(31,30,39,0.92)]');
    const dot = homeLink?.querySelector('span[aria-hidden="true"]');
    expect(dot).toBeNull();
  });

  it('切换到 /data-center 时激活态从 home 切到 trends', () => {
    // 第一次渲染：home 激活
    const { unmount } = renderWithIntl(<BottomNav />);
    expect(
      screen.getByText('首页').closest('a')?.getAttribute('aria-current'),
    ).toBe('page');
    unmount();
    cleanup();

    // 切换路由后重新渲染：trends 激活、home 失活
    setPathname('/data-center');
    renderWithIntl(<BottomNav />);
    const trendsLink = screen.getByText('趋势').closest('a');
    expect(trendsLink?.getAttribute('aria-current')).toBe('page');
    const homeLink = screen.getByText('首页').closest('a');
    expect(homeLink?.getAttribute('aria-current')).toBeNull();
  });
});
