import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { BriefTimeline } from './BriefTimeline';
import { HomepageIntlProvider } from './intl-test-helper';

function renderWithIntl(node: React.ReactNode) {
  return render(<HomepageIntlProvider>{node}</HomepageIntlProvider>);
}

describe('BriefTimeline', () => {
  afterEach(() => cleanup());

  it('渲染 summary 文本', () => {
    renderWithIntl(<BriefTimeline summary="今天恢复状态良好" />);
    expect(screen.getByText('今天恢复状态良好')).toBeInTheDocument();
  });

  it('渲染 Now 标题', () => {
    renderWithIntl(<BriefTimeline summary="x" />);
    expect(screen.getByText('现在')).toBeInTheDocument();
  });

  it('Now 标题显示当前模拟时间与时段', () => {
    renderWithIntl(<BriefTimeline summary="x" currentTime="2026-07-13T15:08" />);
    expect(screen.getByText('现在 - 15:08 PM')).toBeInTheDocument();
  });

  it('Now 左侧箭头使用标题行高居中容器', () => {
    renderWithIntl(<BriefTimeline summary="x" />);
    const arrow = document.querySelector('[data-valo-now-arrow]');
    expect(arrow).not.toBeNull();
    expect(arrow?.className).toContain('h-5');
    expect(arrow?.className).toContain('leading-5');
  });

  it('不渲染第二类 microTips 建议卡片', () => {
    renderWithIntl(<BriefTimeline summary="x" />);
    expect(document.querySelector('[data-valo-micro-tips]')).toBeNull();
    expect(document.querySelector('[data-valo-micro-tip-card]')).toBeNull();
  });

  it('isLoading=true 渲染骨架而非内容', () => {
    renderWithIntl(<BriefTimeline summary="x" isLoading />);
    expect(screen.queryByText('x')).not.toBeInTheDocument();
  });

  it('isLoading=true 标记 aria-busy', () => {
    renderWithIntl(<BriefTimeline summary="x" isLoading />);
    const busy = document.querySelector('[aria-busy="true"]');
    expect(busy).not.toBeNull();
  });

  it('已有内容更新时保留 summary 并显示更新状态', () => {
    renderWithIntl(<BriefTimeline summary="保留的简报" isUpdating />);
    expect(screen.getByText('保留的简报')).toBeInTheDocument();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('更新中');
    expect(status.className).toContain('text-sm');
    expect(status.className).toContain('leading-5');
    expect(status.className).toContain('var(--valo-text-primary)_86%');
    expect(document.querySelector('[data-valo-brief-updating="true"]')).not.toBeNull();
    const ring = document.querySelector<SVGElement>('[data-valo-brief-updating-ring="true"]');
    expect(ring?.tagName).toBe('svg');
    const segments = ring?.querySelectorAll('[data-valo-brief-updating-segment="true"]');
    expect(segments).toHaveLength(4);
    expect(Array.from(segments ?? []).map((segment) => segment.getAttribute('stroke'))).toEqual([
      'var(--valo-active)',
      'var(--valo-accent-cool)',
      'var(--valo-prime)',
      'var(--valo-accent-warm)',
    ]);
    expect(segments?.[0]?.getAttribute('stroke-dasharray')).not.toBeNull();
    expect(ring?.getAttribute('class')).toContain('animate-spin');
    expect(status.querySelector('[class*="valo-brief-update-breathe"]')).not.toBeNull();
  });

  it('summary 支持多行（whitespace-pre-line）', () => {
    renderWithIntl(<BriefTimeline summary={'第一行\n第二行'} />);
    expect(screen.getByText(/第一行/)).toBeInTheDocument();
  });

  it('isStreaming=true 时渲染 summary 文本（不隐藏内容）', () => {
    renderWithIntl(
      <BriefTimeline summary="流式输出中" isStreaming />,
    );
    expect(screen.getByText('流式输出中')).toBeInTheDocument();
  });

  it('isStreaming=true 时 section 标记 aria-busy=true', () => {
    renderWithIntl(
      <BriefTimeline summary="流式输出中" isStreaming />,
    );
    const section = document.querySelector('section[aria-busy="true"]');
    expect(section).not.toBeNull();
  });

  it('isStreaming=true 且 isLoading=false 时仍显示内容（非骨架）', () => {
    renderWithIntl(
      <BriefTimeline summary="正在生成" isStreaming isLoading={false} />,
    );
    // 流式期间不是骨架：内容必须可见
    expect(screen.getByText('正在生成')).toBeInTheDocument();
    // 不应出现骨架 aria-hidden 块
    expect(document.querySelector('.animate-pulse')).toBeNull();
  });

  it('isStreaming=false 时不标记 aria-busy', () => {
    renderWithIntl(
      <BriefTimeline summary="终态内容" isStreaming={false} />,
    );
    const busy = document.querySelector('section[aria-busy="true"]');
    expect(busy).toBeNull();
  });

  it('isStreaming 与 isLoading 同时为 true 时优先渲染骨架', () => {
    renderWithIntl(
      <BriefTimeline summary="x" isLoading isStreaming />,
    );
    // isLoading 优先：骨架期间不显示 summary
    expect(screen.queryByText('x')).not.toBeInTheDocument();
    expect(document.querySelector('section[aria-busy="true"]')).not.toBeNull();
  });
});
