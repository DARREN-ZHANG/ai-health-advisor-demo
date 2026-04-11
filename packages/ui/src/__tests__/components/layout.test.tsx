import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Container, Section, Card, Grid } from '../../components/layout';

describe('Container', () => {
  it('渲染子元素', () => {
    render(<Container>内容</Container>);
    expect(screen.getByText('内容')).toBeInTheDocument();
  });

  it('应用默认 className', () => {
    const { container } = render(<Container>测试</Container>);
    expect(container.firstElementChild?.className).toContain('mx-auto');
    expect(container.firstElementChild?.className).toContain('max-w-7xl');
  });

  it('支持自定义 className', () => {
    const { container } = render(<Container className="extra">测试</Container>);
    expect(container.firstElementChild?.className).toContain('extra');
    expect(container.firstElementChild?.className).toContain('mx-auto');
  });

  it('支持 ref 转发', () => {
    const ref = { current: null };
    render(<Container ref={ref}>测试</Container>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});

describe('Section', () => {
  it('渲染子元素', () => {
    render(<Section>内容</Section>);
    expect(screen.getByText('内容')).toBeInTheDocument();
  });

  it('渲染标题', () => {
    render(<Section title="区块标题">内容</Section>);
    expect(screen.getByText('区块标题')).toBeInTheDocument();
  });

  it('无标题时不渲染 h2', () => {
    const { container } = render(<Section>内容</Section>);
    expect(container.querySelector('h2')).toBeNull();
  });

  it('渲染为 section 元素', () => {
    const { container } = render(<Section>内容</Section>);
    expect(container.firstElementChild?.tagName).toBe('SECTION');
  });
});

describe('Card', () => {
  it('渲染子元素', () => {
    render(<Card>卡片内容</Card>);
    expect(screen.getByText('卡片内容')).toBeInTheDocument();
  });

  it('应用卡片样式', () => {
    const { container } = render(<Card>测试</Card>);
    const el = container.firstElementChild;
    expect(el?.className).toContain('rounded-lg');
    expect(el?.className).toContain('border-slate-700');
    expect(el?.className).toContain('bg-slate-800');
  });

  it('支持自定义 className', () => {
    const { container } = render(<Card className="mt-4">测试</Card>);
    expect(container.firstElementChild?.className).toContain('mt-4');
  });
});

describe('Grid', () => {
  it('渲染子元素', () => {
    render(
      <Grid>
        <span>1</span>
        <span>2</span>
      </Grid>,
    );
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('设置 grid 列数', () => {
    const { container } = render(<Grid cols={3}>内容</Grid>);
    const el = container.firstElementChild;
    expect(el?.className).toContain('grid');
    expect((el as HTMLElement).style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
  });

  it('默认 1 列', () => {
    const { container } = render(<Grid>内容</Grid>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.gridTemplateColumns).toBe('repeat(1, minmax(0, 1fr))');
  });
});
