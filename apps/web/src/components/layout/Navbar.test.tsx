import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { Navbar } from './Navbar';

/**
 * Navbar 单元测试。
 *
 * I6.2 起，桌面端导航 IA 与 BottomNav 一致：Home / Trends / My；
 * 颜色全部走 var(--valo-*) token。
 */

const ZH_MESSAGES = {
  nav: {
    home: '首页',
    trends: '趋势',
    my: '我的',
  },
} as const;

let mockPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

// LanguageSwitcher 内部用 useLocale；mock 成静态值避免依赖 providers。
vi.mock('./LanguageSwitcher', () => ({
  LanguageSwitcher: () => <div data-testid="lang-switcher" />,
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

describe('Navbar', () => {
  afterEach(() => {
    cleanup();
    setPathname('/');
    vi.clearAllMocks();
  });

  it('渲染三个导航链接：Home / Trends / My', () => {
    renderWithIntl(<Navbar />);
    expect(screen.getByText('首页')).toBeInTheDocument();
    expect(screen.getByText('趋势')).toBeInTheDocument();
    expect(screen.getByText('我的')).toBeInTheDocument();
  });

  it('每项携带 data-valo-nav-item 标识', () => {
    renderWithIntl(<Navbar />);
    expect(document.querySelector('[data-valo-nav-item="home"]')).not.toBeNull();
    expect(document.querySelector('[data-valo-nav-item="trends"]')).not.toBeNull();
    expect(document.querySelector('[data-valo-nav-item="my"]')).not.toBeNull();
  });

  it('根元素携带 data-valo-navbar 测试钩', () => {
    renderWithIntl(<Navbar />);
    expect(document.querySelector('[data-valo-navbar="true"]')).not.toBeNull();
  });

  it('品牌图标使用 var(--valo-prime) 颜色 token', () => {
    renderWithIntl(<Navbar />);
    // HeartIcon 是品牌区域的唯一 svg
    const svg = document.querySelector('[data-valo-navbar="true"] svg');
    const cls = svg?.getAttribute('class') ?? '';
    expect(cls).toContain('text-[var(--valo-prime)]');
  });

  it('链接 href 与 BottomNav 一致：/、/data-center、/my', () => {
    renderWithIntl(<Navbar />);
    expect(screen.getByText('首页').closest('a')?.getAttribute('href')).toBe('/');
    expect(screen.getByText('趋势').closest('a')?.getAttribute('href')).toBe(
      '/data-center',
    );
    expect(screen.getByText('我的').closest('a')?.getAttribute('href')).toBe('/my');
  });

  it('当前路由项加 aria-current=page', () => {
    setPathname('/data-center');
    renderWithIntl(<Navbar />);
    const trends = screen.getByText('趋势').closest('a');
    expect(trends?.getAttribute('aria-current')).toBe('page');
    const home = screen.getByText('首页').closest('a');
    expect(home?.getAttribute('aria-current')).toBeNull();
  });

  it('激活项使用 prime 色 token，未激活使用 secondary token', () => {
    renderWithIntl(<Navbar />);
    const home = screen.getByText('首页').closest('a');
    expect(home?.className).toContain('text-[var(--valo-prime)]');
    const my = screen.getByText('我的').closest('a');
    expect(my?.className).toContain('text-[var(--valo-text-secondary)]');
  });

  it('导航容器使用 token 化背景与边框，无硬编码 slate-* / blue-*', () => {
    renderWithIntl(<Navbar />);
    const nav = document.querySelector('[data-valo-navbar="true"]') as HTMLElement;
    const style = nav.getAttribute('style') ?? '';
    expect(style).toContain('var(--valo-glass)');
    expect(style).toContain('var(--valo-border)');
    // 排除 LanguageSwitcher 区域后，组件本身不应出现 slate/blue 颜色字面量
    const navHtml = nav.outerHTML;
    expect(navHtml).not.toMatch(/bg-slate-|text-blue-|bg-blue-/);
  });

  it('保留 LanguageSwitcher slot', () => {
    renderWithIntl(<Navbar />);
    expect(screen.getByTestId('lang-switcher')).toBeInTheDocument();
  });
});
