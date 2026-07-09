import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LifeLogEntrySheet } from './LifeLogEntrySheet';
import { LifeLogIntlProvider } from './intl-test-helper';

function renderSheet(
  props: Partial<React.ComponentProps<typeof LifeLogEntrySheet>> = {},
) {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  render(
    <LifeLogIntlProvider>
      <LifeLogEntrySheet
        open
        type="caffeine"
        defaultTime="10:01"
        onSubmit={onSubmit}
        onClose={onClose}
        {...props}
      />
    </LifeLogIntlProvider>,
  );
  return { onSubmit, onClose };
}

describe('LifeLogEntrySheet', () => {
  afterEach(cleanup);

  it('自定义新增默认一杯并提交 Mock 当日时间', () => {
    const { onSubmit } = renderSheet();
    expect(screen.getByText('1 杯')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    expect(onSubmit).toHaveBeenCalledWith({ cups: 1, timeOfDay: '10:01' });
  });

  it('加减按钮以一个 drink 为步长', () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: '增加' }));
    expect(screen.getByText('2 杯')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '减少' }));
    expect(screen.getByText('1 杯')).toBeTruthy();
  });

  it('点击时间打开时间弹窗并可完成', () => {
    renderSheet();
    const timeButton = document.querySelector('[data-valo-life-log-time]');
    if (!timeButton) throw new Error('Missing time button');
    fireEvent.click(timeButton);
    expect(screen.getByRole('dialog', { name: '选择时间' })).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue('10:01'), {
      target: { value: '14:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: '完成' }));
    expect(screen.getByText('14:00')).toBeTruthy();
  });

  it('饮水使用 250ml 为一个单位', () => {
    renderSheet({ type: 'hydration' });
    expect(screen.getByText('250ml')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '增加' }));
    expect(screen.getByText('500ml')).toBeTruthy();
  });

  it('编辑模式预填记录并提供更新和删除', () => {
    const onDelete = vi.fn();
    renderSheet({
      initialEntry: {
        id: 'entry',
        profileId: 'profile-a',
        type: 'caffeine',
        cups: 2,
        timestamp: '2026-07-08T14:00',
      },
      onDelete,
    });
    expect(screen.getByText('2 杯')).toBeTruthy();
    expect(screen.getByRole('button', { name: '更新' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(onDelete).toHaveBeenCalled();
  });

  it('返回关闭弹窗', () => {
    const { onClose } = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: '返回' }));
    expect(onClose).toHaveBeenCalled();
  });
});
