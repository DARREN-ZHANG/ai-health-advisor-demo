import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FutureSuggestion } from '@health-advisor/shared';
import { FutureTimelineBlock } from './FutureTimelineBlock';
import { HomepageIntlProvider } from './intl-test-helper';

const suggestion: FutureSuggestion = {
  timePoint: '15:00',
  predictedState: '下午 HRV 可能出现低谷',
  rationale: '今天午后摄入了咖啡因',
  action: {
    id: 'future-break',
    emoji: '🧘',
    title: '提前进行三分钟呼吸练习',
    description: '用缓慢呼吸降低交感神经负担',
    aiPromise: '记录选择',
    interaction: {
      kind: 'micro_event',
      microEvent: {
        type: 'micro_deep_breathing',
        durationMinutes: 3,
      },
    },
  },
};

function renderBlock(value = suggestion) {
  return render(
    <HomepageIntlProvider>
      <FutureTimelineBlock suggestion={value} />
    </HomepageIntlProvider>,
  );
}

describe('FutureTimelineBlock', () => {
  afterEach(cleanup);

  it('按设计稿格式展示时段和时间', () => {
    renderBlock();

    const heading = screen.getByRole('heading', {
      name: '下午 - 15:00 PM',
    });
    expect(heading).toHaveClass('text-sm', 'leading-5', 'font-medium');
  });

  it('将预测、依据和建议合并为一个自然段', () => {
    renderBlock();

    expect(screen.getAllByRole('paragraph')).toHaveLength(1);
    expect(
      screen.getByText(
        '基于今天午后摄入了咖啡因，下午 HRV 可能出现低谷。建议提前进行三分钟呼吸练习：用缓慢呼吸降低交感神经负担',
      ),
    ).toHaveClass('mt-3', 'text-sm', 'leading-5');
  });

  it('不展示确认和稍后 Action', () => {
    renderBlock();

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('晚间预测使用晚间标题', () => {
    renderBlock({ ...suggestion, timePoint: '22:45' });

    expect(screen.getByRole('heading', { name: '晚间 - 22:45 PM' })).toBeInTheDocument();
  });

  it('上午预测使用上午标题', () => {
    renderBlock({ ...suggestion, timePoint: '9:30' });

    expect(screen.getByRole('heading', { name: '上午 - 9:30 AM' })).toBeInTheDocument();
  });

  // —— 打字机渐进式渲染（Task 9）——

  // 用于打字机测试的简化建议（文案短，便于在定时器推进后用 Regex 匹配片段）
  const typewriterSuggestion: FutureSuggestion = {
    timePoint: '15:30',
    predictedState: '低谷',
    rationale: '咖啡因',
    action: {
      id: 'f1',
      emoji: '🧘',
      title: '呼吸',
      description: '深呼吸',
      aiPromise: '记录',
    },
  };

  it('animate=true 时 predictionBody 整段逐字增长', () => {
    vi.useFakeTimers();
    render(
      <HomepageIntlProvider>
        <FutureTimelineBlock suggestion={typewriterSuggestion} animate done={false} />
      </HomepageIntlProvider>,
    );

    // timePoint 立即显示（不参与打字机）
    expect(screen.getByText(/15:30/)).toBeInTheDocument();

    // 初始：predictionBody 尚未完整出现（打字机刚启动，整段为空）
    expect(screen.queryByText(/低谷/)).not.toBeInTheDocument();
    expect(screen.queryByText(/咖啡因/)).not.toBeInTheDocument();

    // 合成段短，30ms × 字数足够在 1000ms 内完成
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // 整段完成后，用 Regex 匹配片段（避免精确全文依赖）
    expect(screen.getByText(/低谷/)).toBeInTheDocument();
    expect(screen.getByText(/咖啡因/)).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('done=true 立即显示全文（跳过打字机）', () => {
    render(
      <HomepageIntlProvider>
        <FutureTimelineBlock suggestion={typewriterSuggestion} done />
      </HomepageIntlProvider>,
    );

    expect(screen.getByText(/低谷/)).toBeInTheDocument();
    expect(screen.getByText(/咖啡因/)).toBeInTheDocument();
  });

  it('done 从 false 切到 true 时立即补全', () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <HomepageIntlProvider>
        <FutureTimelineBlock suggestion={typewriterSuggestion} animate done={false} />
      </HomepageIntlProvider>,
    );

    rerender(
      <HomepageIntlProvider>
        <FutureTimelineBlock suggestion={typewriterSuggestion} animate done />
      </HomepageIntlProvider>,
    );

    expect(screen.getByText(/低谷/)).toBeInTheDocument();
    vi.useRealTimers();
  });
});
