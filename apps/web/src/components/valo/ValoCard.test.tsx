import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { ValoCard } from './ValoCard';

describe('ValoCard', () => {
  it('渲染子元素', () => {
    render(<ValoCard>卡片内容</ValoCard>);
    expect(screen.getByText('卡片内容')).toBeInTheDocument();
  });

  it('默认渲染为 div', () => {
    const { container } = render(<ValoCard>内容</ValoCard>);
    expect(container.firstElementChild?.tagName).toBe('DIV');
  });

  it('支持 as 语义化为 section', () => {
    const { container } = render(<ValoCard as="section">内容</ValoCard>);
    expect(container.firstElementChild?.tagName).toBe('SECTION');
  });

  it('应用 Valo 表面 token 样式（大圆角、弱边框、深色层级）', () => {
    const { container } = render(<ValoCard>内容</ValoCard>);
    const el = container.firstElementChild as HTMLElement;
    // 大圆角
    expect(el.className).toContain('rounded-2xl');
    // 引用 surface token
    expect(el.className).toContain('bg-[var(--valo-surface)]');
    // 引用文本主色 token
    expect(el.className).toContain('text-[var(--valo-text-primary)]');
    // 引用边框 token
    expect(el.className).toContain('border-[var(--valo-border)]');
  });

  it('默认 variant=default', () => {
    const { container } = render(<ValoCard>内容</ValoCard>);
    expect(container.firstElementChild?.className).not.toContain('backdrop-blur');
  });

  it('variant=glass 增加毛玻璃与阴影层级', () => {
    const { container } = render(<ValoCard variant="glass">内容</ValoCard>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('backdrop-blur-md');
    expect(el.className).toContain('shadow-[var(--valo-shadow-elevated)]');
  });

  it('支持自定义 className 追加', () => {
    const { container } = render(<ValoCard className="mt-4 extra">内容</ValoCard>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('mt-4');
    expect(el.className).toContain('extra');
    // 默认样式仍然存在
    expect(el.className).toContain('rounded-2xl');
  });

  it('转发 ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ValoCard ref={ref}>内容</ValoCard>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('透传 aria 属性', () => {
    render(
      <ValoCard aria-label="状态卡" aria-describedby="tip">
        内容
      </ValoCard>,
    );
    const el = screen.getByText('内容');
    expect(el.getAttribute('aria-label')).toBe('状态卡');
    expect(el.getAttribute('aria-describedby')).toBe('tip');
  });

  it('as 多态在运行期正确切换元素并透传 rest 属性', () => {
    // 弱多态设计：元素特定属性（href 等）不在编译期类型里，但运行期必须
    // 通过 rest 透传正确渲染。这里以 @ts-expect-error 标注并显式断言契约，
    // 防止后续重构悄悄破坏 as 的 rest 转发。
    // @ts-expect-error href 不在弱多态 ValoCardProps 的编译期类型中
    const { container } = render(<ValoCard as="a" href="/foo">链接卡片</ValoCard>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe('A');
    expect(el.getAttribute('href')).toBe('/foo');
  });

  it('children 为 undefined 时仍渲染带样式的空表面容器', () => {
    const { container } = render(<ValoCard />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).not.toBeNull();
    // 默认表面样式仍在，调用方负责空状态文案
    expect(el.className).toContain('rounded-2xl');
    expect(el.className).toContain('bg-[var(--valo-surface)]');
    expect(el.children).toHaveLength(0);
  });
});
