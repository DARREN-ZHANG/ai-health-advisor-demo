'use client';

import { useEffect, type RefObject } from 'react';

/**
 * useFocusTrap —— 在容器内约束 Tab/Shift+Tab 焦点循环。
 *
 * 行为契约：
 * - `active` 为 true 时，Tab 与 Shift+Tab 在容器内的可聚焦元素间循环，
 *   不会离开容器。
 * - 容器内没有可聚焦元素时不干预，避免破坏极简弹层。
 * - `onEscape` 在按下 Escape 时触发（默认 undefined 表示不处理）。
 * - 该 hook 不主动移动焦点；调用方负责把焦点放到正确位置（initialFocusRef
 *   或容器自身）。
 *
 * 注意：jsdom 不能完整模拟 Tab 默认行为，循环正确性需在浏览器中验证。
 */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]):not([aria-disabled="true"]), ' +
  'input:not([disabled]):not([aria-disabled="true"]), ' +
  'select:not([disabled]):not([aria-disabled="true"]), ' +
  'textarea:not([disabled]):not([aria-disabled="true"]), ' +
  '[tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

export interface FocusTrapOptions {
  active: boolean;
  containerRef: RefObject<HTMLElement | null>;
  onEscape?: () => void;
}

export function useFocusTrap({
  active,
  containerRef,
  onEscape,
}: FocusTrapOptions): void {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (onEscape) {
          event.stopPropagation();
          onEscape();
        }
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        // Shift+Tab：从第一个跳到最后一个
        if (active === first || !container.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else {
        // Tab：从最后一个跳到第一个
        if (active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, [active, containerRef, onEscape]);
}
