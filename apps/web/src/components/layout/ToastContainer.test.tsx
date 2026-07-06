import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ToastContainer } from './ToastContainer';
import { useUIStore } from '@/stores/ui.store';

describe('ToastContainer', () => {
  beforeEach(() => {
    useUIStore.setState({ toasts: [] });
  });

  afterEach(() => cleanup());

  it('容器带 role="alert" 与 aria-live="assertive"', () => {
    useUIStore.setState({
      toasts: [
        { id: 't1', message: '出错了', type: 'error' },
      ],
    });
    render(<ToastContainer />);
    const alert = screen.getByRole('alert');
    expect(alert.getAttribute('aria-live')).toBe('assertive');
    expect(alert.getAttribute('aria-atomic')).toBe('true');
  });

  it('error 类型用 --valo-depleted token（不出现 bg-red- 字面量）', () => {
    useUIStore.setState({
      toasts: [{ id: 't1', message: '错误', type: 'error' }],
    });
    render(<ToastContainer />);
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
    render(<ToastContainer />);
    const style = screen.getByRole('alert').getAttribute('style') ?? '';
    expect(style).toContain('var(--valo-prime)');
  });

  it('success 类型用 --valo-active token', () => {
    useUIStore.setState({
      toasts: [{ id: 't1', message: '成功', type: 'success' }],
    });
    render(<ToastContainer />);
    const style = screen.getByRole('alert').getAttribute('style') ?? '';
    expect(style).toContain('var(--valo-active)');
  });

  it('warning 类型用 --valo-sluggish token', () => {
    useUIStore.setState({
      toasts: [{ id: 't1', message: '警告', type: 'warning' }],
    });
    render(<ToastContainer />);
    const style = screen.getByRole('alert').getAttribute('style') ?? '';
    expect(style).toContain('var(--valo-sluggish)');
  });

  it('点击 toast 触发 removeToast', () => {
    useUIStore.setState({
      toasts: [{ id: 't1', message: '可关闭', type: 'info' }],
    });
    render(<ToastContainer />);
    fireEvent.click(screen.getByRole('alert'));
    expect(useUIStore.getState().toasts).toHaveLength(0);
  });
});
