import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useOverlayBehavior } from './useOverlayBehavior';

/**
 * useOverlayBehavior 单元测试。
 *
 * 重点验证 Issue #1 修复：
 * - 打开后焦点设置只在 `open` 由 false → true 时触发。
 * - 关闭时 effect 提前 return，不会再次 focus 容器，避免与
 *   useFocusReturn 的触发器归还发生竞争。
 */
describe('useOverlayBehavior', () => {
  it('open=true 时把焦点设到 containerRef', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const focusSpy = vi.spyOn(div, 'focus');

    const { rerender } = renderHook(
      ({ open }) =>
        useOverlayBehavior({
          open,
          containerRef: { current: div },
          onClose: () => {},
        }),
      { initialProps: { open: false } },
    );

    expect(focusSpy).not.toHaveBeenCalled();

    rerender({ open: true });
    expect(focusSpy).toHaveBeenCalledTimes(1);

    div.remove();
  });

  it('initialFocusRef 优先于 containerRef', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const target = document.createElement('button');
    document.body.appendChild(target);

    const containerFocusSpy = vi.spyOn(div, 'focus');
    const targetFocusSpy = vi.spyOn(target, 'focus');

    const { rerender } = renderHook(
      ({ open }) =>
        useOverlayBehavior({
          open,
          containerRef: { current: div },
          onClose: () => {},
          initialFocusRef: { current: target },
        }),
      { initialProps: { open: false } },
    );

    rerender({ open: true });

    expect(containerFocusSpy).not.toHaveBeenCalled();
    expect(targetFocusSpy).toHaveBeenCalledTimes(1);

    div.remove();
    target.remove();
  });

  it('open 变回 false 时不再抢焦点（useFocusReturn 负责归还）', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const focusSpy = vi.spyOn(div, 'focus');

    const { rerender } = renderHook(
      ({ open }) =>
        useOverlayBehavior({
          open,
          containerRef: { current: div },
          onClose: () => {},
        }),
      { initialProps: { open: false } },
    );

    rerender({ open: true });
    expect(focusSpy).toHaveBeenCalledTimes(1);

    // 关闭：effect 提前 return，不应再次 focus 容器
    rerender({ open: false });
    expect(focusSpy).toHaveBeenCalledTimes(1);

    div.remove();
  });

  it('handleScrimClick 仅响应遮罩自身的点击', () => {
    const onClose = vi.fn();
    const div = document.createElement('div');
    document.body.appendChild(div);
    const child = document.createElement('button');
    div.appendChild(child);

    const { result } = renderHook(() =>
      useOverlayBehavior({
        open: true,
        containerRef: { current: div },
        onClose,
      }),
    );

    // 点击子元素（target !== currentTarget）→ 不关闭
    result.current.handleScrimClick({
      target: child,
      currentTarget: div,
    } as unknown as React.MouseEvent<HTMLDivElement>);
    expect(onClose).not.toHaveBeenCalled();

    // 点击遮罩自身（target === currentTarget）→ 关闭
    result.current.handleScrimClick({
      target: div,
      currentTarget: div,
    } as unknown as React.MouseEvent<HTMLDivElement>);
    expect(onClose).toHaveBeenCalledTimes(1);

    div.remove();
  });

  it('closeOnScrimClick=false 时不关闭', () => {
    const onClose = vi.fn();
    const div = document.createElement('div');
    document.body.appendChild(div);

    const { result } = renderHook(() =>
      useOverlayBehavior({
        open: true,
        containerRef: { current: div },
        onClose,
        closeOnScrimClick: false,
      }),
    );

    result.current.handleScrimClick({
      target: div,
      currentTarget: div,
    } as unknown as React.MouseEvent<HTMLDivElement>);
    expect(onClose).not.toHaveBeenCalled();

    div.remove();
  });
});
