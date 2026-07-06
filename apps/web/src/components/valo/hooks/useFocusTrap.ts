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
 * 可聚焦元素过滤：
 * - 跳过 `disabled` / `aria-disabled="true"`。
 * - 跳过 `inert` 子树（`:not([inert]) :not([inert] *)`）。
 * - 跳过 `display: none`（通过 `offsetParent === null` 判断；`position: fixed`
 *   特例靠 `=== document.activeElement` 兜底）。
 * - 跳过 `visibility: hidden`（通过 `getComputedStyle` 检查）。
 *
 * 注意：jsdom 不能完整模拟 Tab 默认行为，循环正确性需在浏览器中验证。
 */
const FOCUSABLE_SELECTOR =
  'a[href]:not([inert]):not([inert] *), ' +
  'button:not([disabled]):not([aria-disabled="true"]):not([inert]):not([inert] *), ' +
  'input:not([disabled]):not([aria-disabled="true"]):not([inert]):not([inert] *), ' +
  'select:not([disabled]):not([aria-disabled="true"]):not([inert]):not([inert] *), ' +
  'textarea:not([disabled]):not([aria-disabled="true"]):not([inert]):not([inert] *), ' +
  '[tabindex]:not([tabindex="-1"]):not([inert]):not([inert] *), ' +
  '[contenteditable="true"]:not([inert]):not([inert] *)';

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
      ).filter((el) => {
        // display: none 会让 offsetParent 为 null；activeElement 兜底处理
        // position: fixed 等特殊场景。
        const visibleByDisplay = el.offsetParent !== null;
        const isVisible = visibleByDisplay || el === document.activeElement;
        if (!isVisible) return false;
        // 额外过滤 visibility: hidden（offsetParent 无法识别）。
        // getComputedStyle 在 jsdom 始终返回 'visible'，浏览器才会真实返回。
        if (getComputedStyle(el).visibility === 'hidden') return false;
        return true;
      });

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const focusedEl = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        // Shift+Tab：从第一个跳到最后一个
        if (focusedEl === first || !container.contains(focusedEl)) {
          event.preventDefault();
          last.focus();
        }
      } else {
        // Tab：从最后一个跳到第一个
        if (focusedEl === last) {
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
