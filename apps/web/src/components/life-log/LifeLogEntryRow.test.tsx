import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LifeLogEntryRow } from './LifeLogEntryRow';
import { LifeLogIntlProvider } from './intl-test-helper';
import type { LifeLogEntry } from '@/lib/life-log';

function renderWithIntl(node: React.ReactNode) {
  return render(<LifeLogIntlProvider>{node}</LifeLogIntlProvider>);
}

function makeEntry(
  overrides: Partial<LifeLogEntry> = {},
): LifeLogEntry {
  return {
    id: 'entry-1',
    profileId: 'profile-a',
    type: 'caffeine',
    cups: 1,
    timestamp: '2026-07-05T08:30:00.000Z',
    ...overrides,
  };
}

describe('LifeLogEntryRow', () => {
  afterEach(() => cleanup());

  it('渲染时间、杯数与物理量', () => {
    // 固定一个非本地时区无关的时间：使用 09:30 UTC
    renderWithIntl(
      <LifeLogEntryRow
        entry={makeEntry({ cups: 2, timestamp: '2026-07-05T09:30:00.000Z' })}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    // 杯数 · 原始量文本应包含 "2杯 · 100mg"
    expect(screen.getByText(/2杯 · 100mg/)).toBeTruthy();
  });

  it('渲染备注（如有）', () => {
    renderWithIntl(
      <LifeLogEntryRow
        entry={makeEntry({ note: '午后手冲' })}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText('午后手冲')).toBeTruthy();
  });

  it('无备注时不渲染备注节点', () => {
    renderWithIntl(
      <LifeLogEntryRow
        entry={makeEntry()}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    // 备注 p 节点不存在
    const note = screen.queryByText('午后手冲');
    expect(note).toBeNull();
  });

  it('alcohol 类目展示 g 单位', () => {
    renderWithIntl(
      <LifeLogEntryRow
        entry={makeEntry({ type: 'alcohol', cups: 0.5 })}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    // 0.5 杯 alcohol = 7g
    expect(screen.getByText(/0\.5杯 · 7g/)).toBeTruthy();
  });

  it('hydration 类目展示 ml 单位', () => {
    renderWithIntl(
      <LifeLogEntryRow
        entry={makeEntry({ type: 'hydration', cups: 3 })}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    // 3 杯 hydration = 750ml
    expect(screen.getByText(/3杯 · 750ml/)).toBeTruthy();
  });

  it('点击编辑触发 onEdit 回调', () => {
    const onEdit = vi.fn();
    const entry = makeEntry();
    renderWithIntl(
      <LifeLogEntryRow entry={entry} onEdit={onEdit} onDelete={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(entry);
  });

  it('点击删除触发 onDelete 回调', () => {
    const onDelete = vi.fn();
    const entry = makeEntry();
    renderWithIntl(
      <LifeLogEntryRow entry={entry} onEdit={() => {}} onDelete={onDelete} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(entry);
  });

  it('渲染 <time> 元素，dateTime 等于 ISO 时间戳', () => {
    const ts = '2026-07-05T09:30:00.000Z';
    renderWithIntl(
      <LifeLogEntryRow
        entry={makeEntry({ timestamp: ts })}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    const time = screen.getByText(/\d{2}:\d{2}/);
    expect(time.tagName).toBe('TIME');
    expect(time.getAttribute('datetime')).toBe(ts);
  });
});
