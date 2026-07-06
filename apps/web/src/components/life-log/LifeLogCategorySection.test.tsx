import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LifeLogCategorySection } from './LifeLogCategorySection';
import { LifeLogIntlProvider } from './intl-test-helper';
import type { LifeLogEntry } from '@/lib/life-log';

function renderWithIntl(node: React.ReactNode) {
  return render(<LifeLogIntlProvider>{node}</LifeLogIntlProvider>);
}

function makeEntry(
  overrides: Partial<LifeLogEntry> = {},
): LifeLogEntry {
  return {
    id: 'e-' + Math.random().toString(36).slice(2, 6),
    profileId: 'profile-a',
    type: 'caffeine',
    cups: 1,
    timestamp: '2026-07-05T08:00:00.000Z',
    ...overrides,
  };
}

describe('LifeLogCategorySection', () => {
  afterEach(() => cleanup());

  it('渲染类目标题与空态文案', () => {
    renderWithIntl(
      <LifeLogCategorySection
        type="caffeine"
        entries={[]}
        onQuickAdd={() => {}}
        onCustomAdd={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText('咖啡因')).toBeTruthy();
    expect(screen.getByText('暂无记录')).toBeTruthy();
    // 默认 totalToday 显示 "今日: 0 杯 (0mg)"
    expect(screen.getByText(/今日: 0 杯 \(0mg\)/)).toBeTruthy();
  });

  it('汇总多个条目的总杯数与物理量', () => {
    const entries: LifeLogEntry[] = [
      makeEntry({ cups: 1, type: 'caffeine' }),
      makeEntry({ cups: 2, type: 'caffeine' }),
    ];
    renderWithIntl(
      <LifeLogCategorySection
        type="caffeine"
        entries={entries}
        onQuickAdd={() => {}}
        onCustomAdd={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    // 3 杯 caffeine = 150mg
    expect(screen.getByText(/今日: 3 杯 \(150mg\)/)).toBeTruthy();
  });

  it('hydration 类目展示 ml 总量', () => {
    const entries: LifeLogEntry[] = [
      makeEntry({ cups: 2, type: 'hydration' }),
    ];
    renderWithIntl(
      <LifeLogCategorySection
        type="hydration"
        entries={entries}
        onQuickAdd={() => {}}
        onCustomAdd={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    // 2 杯 hydration = 500ml
    expect(screen.getByText(/今日: 2 杯 \(500ml\)/)).toBeTruthy();
  });

  it('点击快捷加按钮触发 onQuickAdd', () => {
    const onQuickAdd = vi.fn();
    renderWithIntl(
      <LifeLogCategorySection
        type="caffeine"
        entries={[]}
        onQuickAdd={onQuickAdd}
        onCustomAdd={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '+1 杯' }));
    expect(onQuickAdd).toHaveBeenCalledWith('caffeine');
  });

  it('点击自定义按钮触发 onCustomAdd', () => {
    const onCustomAdd = vi.fn();
    renderWithIntl(
      <LifeLogCategorySection
        type="alcohol"
        entries={[]}
        onQuickAdd={() => {}}
        onCustomAdd={onCustomAdd}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '自定义' }));
    expect(onCustomAdd).toHaveBeenCalledWith('alcohol');
  });

  it('渲染所有传入条目（按时间倒序由父组件保证）', () => {
    const entries: LifeLogEntry[] = [
      makeEntry({ id: '1', cups: 1 }),
      makeEntry({ id: '2', cups: 2 }),
      makeEntry({ id: '3', cups: 3 }),
    ];
    renderWithIntl(
      <LifeLogCategorySection
        type="caffeine"
        entries={entries}
        onQuickAdd={() => {}}
        onCustomAdd={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    // 三行均渲染：每行至少一个"编辑"按钮
    expect(screen.getAllByRole('button', { name: '编辑' })).toHaveLength(3);
  });

  it('编辑 / 删除按钮透传给 row', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const entry = makeEntry({ id: 'x1' });
    renderWithIntl(
      <LifeLogCategorySection
        type="caffeine"
        entries={[entry]}
        onQuickAdd={() => {}}
        onCustomAdd={() => {}}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    expect(onEdit).toHaveBeenCalledWith(entry);
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(onDelete).toHaveBeenCalledWith(entry);
  });
});
