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
    expect(screen.getByRole('status')).toHaveTextContent('更新中');
    expect(document.querySelector('[data-valo-brief-updating="true"]')).not.toBeNull();
  });

  it('summary 支持多行（whitespace-pre-line）', () => {
    renderWithIntl(<BriefTimeline summary={'第一行\n第二行'} />);
    expect(screen.getByText(/第一行/)).toBeInTheDocument();
  });
});
