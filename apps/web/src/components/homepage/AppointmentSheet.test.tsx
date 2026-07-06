import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AppointmentSheet } from './AppointmentSheet';
import { HomepageIntlProvider } from './intl-test-helper';

function renderWithIntl(node: React.ReactNode) {
  return render(<HomepageIntlProvider>{node}</HomepageIntlProvider>);
}

describe('AppointmentSheet', () => {
  afterEach(() => cleanup());

  it('open=true 渲染标题与确认按钮', () => {
    renderWithIntl(
      <AppointmentSheet
        open
        title="添加到日历"
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    // 移动端 + 桌面端各渲染一份
    expect(screen.getAllByText('添加到日历').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '确认' }).length).toBeGreaterThan(0);
  });

  it('渲染 description', () => {
    renderWithIntl(
      <AppointmentSheet
        open
        title="t"
        description="明天 9 点就诊"
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getAllByText('明天 9 点就诊').length).toBeGreaterThan(0);
  });

  it('渲染 demo disclaimer 文案', () => {
    renderWithIntl(
      <AppointmentSheet
        open
        title="t"
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(
      screen.getAllByText(/演示功能/).length,
    ).toBeGreaterThan(0);
  });

  it('点击确认触发 onConfirm 并关闭', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    renderWithIntl(
      <AppointmentSheet
        open
        title="t"
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: '确认' })[0]!);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('点击取消触发 onClose 但不触发 onConfirm', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    renderWithIntl(
      <AppointmentSheet
        open
        title="t"
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: '取消' })[0]!);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('open=false 不渲染内容', () => {
    renderWithIntl(
      <AppointmentSheet
        open={false}
        title="添加到日历"
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.queryAllByRole('button', { name: '确认' })).toHaveLength(0);
  });

  it('不调用任何外部 calendar API（无 window.open 改动）', () => {
    const openSpy = vi.spyOn(window, 'open');
    renderWithIntl(
      <AppointmentSheet
        open
        title="t"
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: '确认' })[0]!);
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });
});
