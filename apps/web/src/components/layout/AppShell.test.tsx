import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppShell } from './AppShell';

describe('AppShell', () => {
  it('渲染 children', () => {
    render(<AppShell>主内容</AppShell>);
    expect(screen.getByText('主内容')).toBeInTheDocument();
  });

  it('应用 --valo-canvas 背景与 --valo-text-primary 文本色', () => {
    const { container } = render(<AppShell>内容</AppShell>);
    const root = container.firstElementChild as HTMLElement;
    const style = root.getAttribute('style') ?? '';
    expect(style).toContain('var(--valo-canvas)');
    expect(style).toContain('var(--valo-text-primary)');
  });

  it('渲染 navbar / bottomNav / floating / overlay slot', () => {
    render(
      <AppShell
        navbar={<nav data-testid="nav">导航</nav>}
        bottomNav={<nav data-testid="bottom">底栏</nav>}
        floating={<button>悬浮</button>}
        overlay={<div>toast slot</div>}
      >
        主体
      </AppShell>,
    );
    expect(screen.getByTestId('nav')).toBeInTheDocument();
    expect(screen.getByTestId('bottom')).toBeInTheDocument();
    expect(screen.getByText('悬浮')).toBeInTheDocument();
    expect(screen.getByText('toast slot')).toBeInTheDocument();
  });

  it('使用 main 元素承载主体并 flex-1', () => {
    const { container } = render(<AppShell>主内容</AppShell>);
    const main = container.querySelector('main');
    expect(main).not.toBeNull();
    expect(main?.className).toContain('flex-1');
  });

  it('根容器有 min-h-screen 与底部 padding（移动 16 / 桌面 0）', () => {
    const { container } = render(<AppShell>内容</AppShell>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('min-h-screen');
    expect(root.className).toContain('pb-16');
    expect(root.className).toContain('md:pb-0');
  });

  it('追加自定义 className', () => {
    const { container } = render(
      <AppShell className="custom-class">内容</AppShell>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('custom-class');
  });
});
