import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecentEventsDisclosure } from './RecentEventsDisclosure';
import { DemoControlIntlProvider } from './intl-test-helper';
import type { RecentEventEntry } from './RecentEventsDisclosure';

const SAMPLE_EVENTS: RecentEventEntry[] = [
  {
    recognizedEventId: 'evt-1',
    type: 'walk',
    start: '2026-07-05T08:30',
    end: '2026-07-05T09:00',
  },
  {
    recognizedEventId: 'evt-2',
    type: 'possible_caffeine_intake',
    start: '2026-07-05T10:00',
    end: '2026-07-05T10:15',
  },
];

function renderWithIntl(node: React.ReactNode) {
  return render(<DemoControlIntlProvider>{node}</DemoControlIntlProvider>);
}

describe('RecentEventsDisclosure', () => {
  it('默认收起：只显示头部，不渲染列表项', () => {
    renderWithIntl(<RecentEventsDisclosure events={SAMPLE_EVENTS} />);
    const header = screen.getByRole('button');
    expect(header).toHaveTextContent('近期事件 (2)');
    // 列表尚未渲染
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('点击头部展开，渲染事件列表为 ul', () => {
    renderWithIntl(<RecentEventsDisclosure events={SAMPLE_EVENTS} />);
    fireEvent.click(screen.getByRole('button'));
    const list = screen.getByRole('list');
    expect(list.tagName).toBe('UL');
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
  });

  it('展开后头部按钮的 aria-expanded 为 true', () => {
    renderWithIntl(<RecentEventsDisclosure events={SAMPLE_EVENTS} />);
    const header = screen.getByRole('button');
    expect(header.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('true');
  });

  it('再次点击头部收起', () => {
    renderWithIntl(<RecentEventsDisclosure events={SAMPLE_EVENTS} />);
    const header = screen.getByRole('button');
    fireEvent.click(header);
    fireEvent.click(header);
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('initiallyOpen=true 初始即展开', () => {
    renderWithIntl(
      <RecentEventsDisclosure events={SAMPLE_EVENTS} initiallyOpen />,
    );
    expect(screen.getByRole('list')).toBeInTheDocument();
  });

  it('空事件列表：按钮被禁用且显示「暂无近期事件」', () => {
    renderWithIntl(<RecentEventsDisclosure events={[]} />);
    const header = screen.getByRole('button');
    expect(header).toBeDisabled();
    expect(header).toHaveTextContent('暂无近期事件');
  });

  it('每项渲染图标与时间区间，HH:MM 格式', () => {
    renderWithIntl(
      <RecentEventsDisclosure events={SAMPLE_EVENTS} initiallyOpen />,
    );
    expect(screen.getByText('08:30–09:00')).toBeInTheDocument();
    expect(screen.getByText('10:00–10:15')).toBeInTheDocument();
    // walk 图标
    expect(screen.getByText('🚶')).toBeInTheDocument();
  });

  it('已知事件类型走 labelKey 翻译：walk → 散步，possible_caffeine_intake → 咖啡因', () => {
    renderWithIntl(
      <RecentEventsDisclosure events={SAMPLE_EVENTS} initiallyOpen />,
    );
    expect(screen.getByText('散步')).toBeInTheDocument();
    expect(screen.getByText('咖啡因')).toBeInTheDocument();
    // 不应再出现 type 字面量作为可见 label。
    expect(screen.queryByText('walk')).toBeNull();
    expect(screen.queryByText('possible_caffeine_intake')).toBeNull();
  });

  it('事件类型未知时回退到 type 字面量', () => {
    renderWithIntl(
      <RecentEventsDisclosure
        events={[
          {
            recognizedEventId: 'evt-x',
            type: 'unknown_type',
            start: '2026-07-05T08:30',
            end: '2026-07-05T09:00',
          },
        ]}
        initiallyOpen
      />,
    );
    expect(screen.getByText('unknown_type')).toBeInTheDocument();
  });

  it('header 与最小触达区 data-valo-touch', () => {
    renderWithIntl(<RecentEventsDisclosure events={SAMPLE_EVENTS} />);
    expect(screen.getByRole('button').getAttribute('data-valo-touch')).toBe('true');
  });
});
