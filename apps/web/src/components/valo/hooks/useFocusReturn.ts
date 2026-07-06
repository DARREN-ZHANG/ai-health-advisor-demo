'use client';

import { useEffect, type RefObject } from 'react';

/**
 * useFocusReturn —— 弹层打开时记录触发器焦点，关闭时还原。
 *
 * 行为契约：
 * - 当 `open` 由 false → true，记录当前 `document.activeElement` 作为触发器。
 * - 当 `open` 由 true → false，把焦点还给记录的触发器（如果仍可聚焦）。
 * - 调用方可通过 `triggerRef` 显式指定触发器；不传则记录打开瞬间的活跃元素。
 *
 * 注意：jsdom 中 activeElement 不可靠，浏览器需手动验证。
 */
export interface FocusReturnOptions {
  open: boolean;
  triggerRef?: RefObject<HTMLElement | null>;
}

export function useFocusReturn({ open, triggerRef }: FocusReturnOptions): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!open) return;

    // 打开瞬间记录触发器
    const captured =
      triggerRef?.current ??
      (document.activeElement as HTMLElement | null);

    return () => {
      // 关闭时把焦点还给触发器
      const target = triggerRef?.current ?? captured;
      if (target && typeof target.focus === 'function') {
        target.focus();
      }
    };
    // 仅依赖 open 的变化；triggerRef 通过 ref 稳定
  }, [open]);
}
