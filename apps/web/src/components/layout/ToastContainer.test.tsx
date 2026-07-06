import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ToastContainer } from './ToastContainer';
import { useUIStore } from '@/stores/ui.store';

// ToastContainer 通过 useTranslations('common') 拿 close 文案；
// 测试只提供最小 common.close，避免触发 MISSING_MESSAGE。
const ZH_MESSAGES = {
  common: {
    close: '关闭',
  },
} as const;

function renderWithIntl(node: ReactNode) {
  return render(
    <NextIntlClientProvider locale="zh" messages={ZH_MESSAGES}>
      {node}
    </NextIntlClientProvider>,
  );
}

describe('ToastContainer', () => {
  beforeEach(() => {
    useUIStore.setState({ toasts: [] });
  });

  afterEach(() => cleanup());

  it('error toast 容器带 role="alert" 与 aria-live="assertive"', () => {
    useUIStore.setState({
      toasts: [
        { id: 't1', message: '出错了', type: 'error' },
      ],
    });
    renderWithIntl(<ToastContainer />);
    const alert = screen.getByRole('alert');
    expect(alert.getAttribute('aria-live')).toBe('assertive');
    expect(alert.getAttribute('aria-atomic')).toBe('true');
  });

  it('info/success/warning 类型用 aria-live="polite"', () => {
    useUIStore.setState({
      toasts: [
        { id: 't1', message: '提示', type: 'info' },
        { id: 't2', message: '成功', type: 'success' },
        { id: 't3', message: '警告', type: 'warning' },
      ],
    });
    renderWithIntl(<ToastContainer />);
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(3);
    alerts.forEach((alert) => {
      expect(alert.getAttribute('aria-live')).toBe('polite');
    });
  });

  it('error 类型用 --valo-depleted token（不出现 bg-red- 字面量）', () => {
    useUIStore.setState({
      toasts: [{ id: 't1', message: '错误', type: 'error' }],
    });
    renderWithIntl(<ToastContainer />);
    const alert = screen.getByRole('alert');
    const style = alert.getAttribute('style') ?? '';
    expect(style).toContain('var(--valo-depleted)');
    expect(alert.className).not.toContain('bg-red-');
    expect(alert.className).not.toContain('border-red-');
  });

  it('info 类型用 --valo-prime token', () => {
    useUIStore.setState({
      toasts: [{ id: 't1', message: '提示', type: 'info' }],
    });
    renderWithIntl(<ToastContainer />);
    const style = screen.getByRole('alert').getAttribute('style') ?? '';
    expect(style).toContain('var(--valo-prime)');
  });

  it('success 类型用 --valo-active token', () => {
    useUIStore.setState({
      toasts: [{ id: 't1', message: '成功', type: 'success' }],
    });
    renderWithIntl(<ToastContainer />);
    const style = screen.getByRole('alert').getAttribute('style') ?? '';
    expect(style).toContain('var(--valo-active)');
  });

  it('warning 类型用 --valo-sluggish token', () => {
    useUIStore.setState({
      toasts: [{ id: 't1', message: '警告', type: 'warning' }],
    });
    renderWithIntl(<ToastContainer />);
    const style = screen.getByRole('alert').getAttribute('style') ?? '';
    expect(style).toContain('var(--valo-sluggish)');
  });

  it('点击 toast 触发 removeToast', () => {
    useUIStore.setState({
      toasts: [{ id: 't1', message: '可关闭', type: 'info' }],
    });
    renderWithIntl(<ToastContainer />);
    fireEvent.click(screen.getByRole('alert'));
    expect(useUIStore.getState().toasts).toHaveLength(0);
  });

  it('关闭按钮 aria-label 走 i18n key', () => {
    useUIStore.setState({
      toasts: [{ id: 't1', message: '测试', type: 'info' }],
    });
    renderWithIntl(<ToastContainer />);
    // ToastContainer 用 useTranslations('common')，zh 默认 'close' = '关闭'。
    // 这里只验证按钮存在且有 aria-label，不绑死字面量与未来翻译变动。
    const closeBtn = screen.getByRole('button', { name: '关闭' });
    expect(closeBtn).toBeInTheDocument();
  });
});
