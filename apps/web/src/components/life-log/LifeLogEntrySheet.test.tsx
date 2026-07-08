import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LifeLogEntrySheet } from './LifeLogEntrySheet';
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
    timestamp: '2026-07-05T09:30:00.000Z',
    note: 'afternoon',
    ...overrides,
  };
}

describe('LifeLogEntrySheet', () => {
  afterEach(() => cleanup());

  it('新增模式：渲染"自定义"标题和添加按钮', () => {
    renderWithIntl(
      <LifeLogEntrySheet
        open
        type="caffeine"
        onSubmit={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getAllByText(/自定义/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '添加' }).length).toBeGreaterThan(0);
  });

  it('编辑模式：渲染"编辑记录"标题并预填字段', () => {
    renderWithIntl(
      <LifeLogEntrySheet
        open
        type="caffeine"
        initialEntry={makeEntry({ cups: 2, note: 'double shot' })}
        onSubmit={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getAllByText(/编辑记录/).length).toBeGreaterThan(0);
    // cups input 预填 2（移动端 + 桌面端各一）
    expect(screen.getAllByDisplayValue('2').length).toBeGreaterThan(0);
    // note textarea 预填 "double shot"
    expect(screen.getAllByDisplayValue('double shot').length).toBeGreaterThan(0);
  });

  it('保存调用 onSubmit，cups/timestamp/note 字段被传入', () => {
    const onSubmit = vi.fn();
    renderWithIntl(
      <LifeLogEntrySheet
        open
        type="caffeine"
        initialEntry={makeEntry({ cups: 1.5, note: 'latte' })}
        onSubmit={onSubmit}
        onClose={() => {}}
      />,
    );
    // 找到任意一个保存按钮（移动端 + 桌面端各一）
    const saveButtons = screen.getAllByRole('button', { name: '保存' });
    fireEvent.click(saveButtons[0]!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const arg = onSubmit.mock.calls[0]![0];
    expect(arg.cups).toBe(1.5);
    expect(typeof arg.timestamp).toBe('string');
    expect(arg.timestamp.length).toBeGreaterThan(0);
    expect(arg.note).toBe('latte');
  });

  it('新增模式点击添加调用 onSubmit', () => {
    const onSubmit = vi.fn();
    renderWithIntl(
      <LifeLogEntrySheet
        open
        type="caffeine"
        onSubmit={onSubmit}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: '添加' })[0]!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0].cups).toBe(1);
  });

  it('空 note 保存时为 undefined（不传空串）', () => {
    const onSubmit = vi.fn();
    renderWithIntl(
      <LifeLogEntrySheet
        open
        type="caffeine"
        initialEntry={makeEntry({ cups: 1, note: '' })}
        onSubmit={onSubmit}
        onClose={() => {}}
      />,
    );
    const saveButtons = screen.getAllByRole('button', { name: '保存' });
    fireEvent.click(saveButtons[0]!);
    expect(onSubmit.mock.calls[0]![0].note).toBeUndefined();
  });

  it('新增模式点击关闭调用 onClose 不调用 onSubmit', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    renderWithIntl(
      <LifeLogEntrySheet
        open
        type="caffeine"
        onSubmit={onSubmit}
        onClose={onClose}
      />,
    );
    const closeButtons = screen.getAllByRole('button', { name: '关闭' });
    fireEvent.click(closeButtons[0]!);
    expect(onClose).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('open=false 不渲染', () => {
    renderWithIntl(
      <LifeLogEntrySheet
        open={false}
        type="caffeine"
        onSubmit={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.queryAllByRole('button', { name: '保存' })).toHaveLength(0);
  });

  it('hydration 类目预览展示 ml 单位', () => {
    renderWithIntl(
      <LifeLogEntrySheet
        open
        type="hydration"
        initialEntry={makeEntry({ type: 'hydration', cups: 2 })}
        onSubmit={() => {}}
        onClose={() => {}}
      />,
    );
    // 2 杯 hydration = 500ml
    expect(screen.getAllByText(/500ml/).length).toBeGreaterThan(0);
  });

  it('alcohol 类目预览展示 g 单位', () => {
    renderWithIntl(
      <LifeLogEntrySheet
        open
        type="alcohol"
        initialEntry={makeEntry({ type: 'alcohol', cups: 1 })}
        onSubmit={() => {}}
        onClose={() => {}}
      />,
    );
    // 1 杯 alcohol = 14g
    expect(screen.getAllByText(/14g/).length).toBeGreaterThan(0);
  });
});
