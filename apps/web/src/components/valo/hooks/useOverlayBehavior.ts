'use client';

import { useEffect, useRef, type MouseEvent, type RefObject } from 'react';
import { useScrollLock } from './useScrollLock';
import { useFocusTrap } from './useFocusTrap';
import { useFocusReturn } from './useFocusReturn';

/**
 * useOverlayBehavior —— 整合 overlay 通用行为。
 *
 * 把以下副作用集中到一个 hook，避免 ValoSheet / ValoDialog 重复 wiring：
 * - 滚动锁定（useScrollLock）。
 * - 焦点约束 + Escape（useFocusTrap）。
 * - 关闭后焦点归还触发器（useFocusReturn）。
 * - 打开后把焦点移到 `initialFocusRef` 或容器自身（一次性 effect，
 *   仅在 `open` 由 false → true 时触发，避免 framer-motion
 *   `onAnimationComplete` 在 exit 时也会触发的 bug）。
 *
 * 返回 scrim 点击等组件层仍需直接绑定的回调。
 *
 * 注意：jsdom 无法可靠验证焦点移动 / 归还，相关行为需在浏览器中验证。
 */
export interface OverlayBehaviorOptions {
  open: boolean;
  containerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  closeOnScrimClick?: boolean;
  closeOnEscape?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
}

export interface OverlayBehaviorResult {
  /** 绑定到 scrim 元素的 onClick；根据 closeOnScrimClick 决定是否关闭。 */
  handleScrimClick: (event: MouseEvent<HTMLDivElement>) => void;
}

export function useOverlayBehavior({
  open,
  containerRef,
  onClose,
  closeOnScrimClick = true,
  closeOnEscape = true,
  initialFocusRef,
}: OverlayBehaviorOptions): OverlayBehaviorResult {
  useScrollLock(open);
  useFocusTrap({
    active: open,
    containerRef,
    onEscape: closeOnEscape ? onClose : undefined,
  });
  useFocusReturn({ open });

  // 打开后把焦点移到 initialFocusRef 或容器自身。
  // 关键：使用独立的 effect，仅在 `open` 变为 true 时触发一次，
  // 不依赖 framer-motion 的 onAnimationComplete（它在 exit 时也会触发，
  // 会在关闭瞬间再次抢焦点，破坏 useFocusReturn 的触发器还原）。
  useEffect(() => {
    if (!open) return;
    const node = containerRef.current;
    if (!node) return;
    // 容器已经挂载；直接聚焦。framer-motion 的初始动画不会改变焦点。
    const target = initialFocusRef?.current ?? node;
    target.focus();
    // 仅依赖 open；containerRef / initialFocusRef 是稳定的 ref。
  }, [open]);

  const closeOnScrimClickRef = useRef(closeOnScrimClick);
  closeOnScrimClickRef.current = closeOnScrimClick;

  const handleScrimClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!closeOnScrimClickRef.current) return;
    // 仅响应遮罩自身的点击，避免穿透到内容。
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return { handleScrimClick };
}
