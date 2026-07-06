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

  it('渲染 microTips 列表', () => {
    renderWithIntl(
      <BriefTimeline summary="x" microTips={['多喝水', '适当拉伸']} />,
    );
    expect(screen.getByText('多喝水')).toBeInTheDocument();
    expect(screen.getByText('适当拉伸')).toBeInTheDocument();
    expect(screen.getByText('提示')).toBeInTheDocument();
  });

  it('microTips 为空时不渲染 Tips 区', () => {
    renderWithIntl(<BriefTimeline summary="x" microTips={[]} />);
    expect(screen.queryByText('提示')).not.toBeInTheDocument();
  });

  it('默认无 microTips 不渲染 Tips 区', () => {
    renderWithIntl(<BriefTimeline summary="x" />);
    expect(screen.queryByText('提示')).not.toBeInTheDocument();
  });

  it('microTips 项不渲染任何按钮（非交互）', () => {
    renderWithIntl(
      <BriefTimeline summary="x" microTips={['提示一', '提示二']} />,
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('isLoading=true 渲染骨架而非内容', () => {
    renderWithIntl(
      <BriefTimeline summary="x" microTips={['a']} isLoading />,
    );
    expect(screen.queryByText('x')).not.toBeInTheDocument();
    expect(screen.queryByText('a')).not.toBeInTheDocument();
  });

  it('isLoading=true 标记 aria-busy', () => {
    renderWithIntl(<BriefTimeline summary="x" isLoading />);
    const busy = document.querySelector('[aria-busy="true"]');
    expect(busy).not.toBeNull();
  });

  it('summary 支持多行（whitespace-pre-line）', () => {
    renderWithIntl(<BriefTimeline summary={'第一行\n第二行'} />);
    expect(screen.getByText(/第一行/)).toBeInTheDocument();
  });
});
