import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button, IconButton, Tabs } from '../../components/interactive';

describe('Button', () => {
  it('渲染按钮文本', () => {
    render(<Button>点击</Button>);
    expect(screen.getByText('点击')).toBeInTheDocument();
  });

  it('响应点击事件', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>点击</Button>);
    fireEvent.click(screen.getByText('点击'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('应用 primary 默认变体样式', () => {
    const { container } = render(<Button>按钮</Button>);
    expect(container.firstElementChild?.className).toContain('bg-blue-600');
  });

  it('应用 secondary 变体样式', () => {
    const { container } = render(<Button variant="secondary">按钮</Button>);
    expect(container.firstElementChild?.className).toContain('bg-slate-700');
  });

  it('应用 ghost 变体样式', () => {
    const { container } = render(<Button variant="ghost">按钮</Button>);
    expect(container.firstElementChild?.className).toContain('bg-transparent');
  });

  it('支持 disabled', () => {
    render(<Button disabled>按钮</Button>);
    expect(screen.getByText('按钮')).toBeDisabled();
  });
});

describe('IconButton', () => {
  it('渲染子元素', () => {
    render(<IconButton>🔔</IconButton>);
    expect(screen.getByText('🔔')).toBeInTheDocument();
  });

  it('响应点击事件', () => {
    const onClick = vi.fn();
    render(<IconButton onClick={onClick}>图标</IconButton>);
    fireEvent.click(screen.getByText('图标'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('应用 p-2 内边距', () => {
    const { container } = render(<IconButton>图标</IconButton>);
    expect(container.firstElementChild?.className).toContain('p-2');
  });
});

describe('Tabs', () => {
  const items = [
    { id: 'tab1', label: '标签一' },
    { id: 'tab2', label: '标签二' },
    { id: 'tab3', label: '标签三' },
  ];

  it('渲染所有标签', () => {
    render(<Tabs items={items} activeId="tab1" onSelect={() => {}} />);
    expect(screen.getByText('标签一')).toBeInTheDocument();
    expect(screen.getByText('标签二')).toBeInTheDocument();
    expect(screen.getByText('标签三')).toBeInTheDocument();
  });

  it('激活项标记 aria-selected', () => {
    render(<Tabs items={items} activeId="tab2" onSelect={() => {}} />);
    expect(screen.getByText('标签二')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('标签一')).toHaveAttribute('aria-selected', 'false');
  });

  it('点击标签触发 onSelect', () => {
    const onSelect = vi.fn();
    render(<Tabs items={items} activeId="tab1" onSelect={onSelect} />);
    fireEvent.click(screen.getByText('标签二'));
    expect(onSelect).toHaveBeenCalledWith('tab2');
  });

  it('激活项应用激活样式', () => {
    render(<Tabs items={items} activeId="tab1" onSelect={() => {}} />);
    expect(screen.getByText('标签一').className).toContain('bg-slate-700');
  });
});
