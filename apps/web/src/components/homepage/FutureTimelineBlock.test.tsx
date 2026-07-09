import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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
});
