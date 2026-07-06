'use client';

import {
  useId,
  useRef,
  type ReactNode,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useScrollLock } from './hooks/useScrollLock';
import { useFocusTrap } from './hooks/useFocusTrap';
import { useFocusReturn } from './hooks/useFocusReturn';

/**
 * ValoSheet —— Valo 设计系统的移动端优先遮罩层。
 *
 * 设计要点（来自 design-manifest.md）：
 * - 移动端：底部 Sheet（`bottom-sheet`）或全屏（`full-screen`）。
 * - 桌面端：由调用方决定是否在同一组件内通过 Tailwind 响应式类切换形态；
 *   本组件本身不进行运行时宽度猜测（参见实现计划 I1.2）。
 * - 黑色半透明遮罩 `--valo-scrim`，点击关闭（可禁用）。
 * - 圆角顶部、`--valo-surface` 背景、`env(safe-area-inset-bottom)` 内边距。
 *
 * 可访问性：
 * - `role="dialog"`、`aria-modal="true"`、强制要求 `ariaLabel` 或 `ariaLabelledBy`。
 * - 打开时锁定 body 滚动，关闭后焦点回到触发器（jsdom 无法验证，需浏览器验证）。
 * - Escape 关闭（可禁用），Tab 循环在容器内（jsdom 无法验证，需浏览器验证）。
 *
 * 给 I2.2 Demo Control：通过 `height` 透传 `92dvh` 等值。
 */
export type ValoSheetVariant = 'bottom-sheet' | 'full-screen';

export interface ValoSheetProps {
  /** 是否打开 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 内容 */
  children: ReactNode;
  /** 可选标题；传入时渲染标题栏与关闭按钮 */
  title?: ReactNode;
  /** 关联标题元素 id，提供可访问名 */
  ariaLabelledBy?: string;
  /** 直接提供可访问名（与 `ariaLabelledBy` 二选一） */
  ariaLabel?: string;
  /** 形态：底部 Sheet（默认）或全屏覆盖 */
  variant?: ValoSheetVariant;
  /**
   * 自定义内容高度，透传给内容容器。
   * Demo Control 移动端可传 `'92dvh'`。
   */
  height?: string | number;
  /** 点击遮罩关闭，默认 true */
  closeOnScrimClick?: boolean;
  /** Escape 关闭，默认 true */
  closeOnEscape?: boolean;
  /** 打开后聚焦的初始元素 */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** 追加 className */
  className?: string;
}

const MOTION_BOTTOM = {
  initial: { y: '100%' },
  animate: { y: 0 },
  exit: { y: '100%' },
  transition: { type: 'tween' as const, duration: 0.25, ease: 'easeOut' as const },
};

const MOTION_FULLSCREEN = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { type: 'tween' as const, duration: 0.2, ease: 'easeOut' as const },
};

const MOTION_SCRIM = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { type: 'tween' as const, duration: 0.2 },
};

export function ValoSheet({
  open,
  onClose,
  children,
  title,
  ariaLabelledBy,
  ariaLabel,
  variant = 'bottom-sheet',
  height,
  closeOnScrimClick = true,
  closeOnEscape = true,
  initialFocusRef,
  className = '',
}: ValoSheetProps) {
  const generatedId = useId();
  const titleId = ariaLabelledBy ?? (title ? generatedId : undefined);

  // 必须提供可访问名：ariaLabel 或 ariaLabelledBy 至少一个
  if (!titleId && !ariaLabel) {
    throw new Error(
      'ValoSheet: 必须提供 ariaLabel 或 ariaLabelledBy（或 title）以提供可访问名',
    );
  }

  const containerRef = useRef<HTMLDivElement>(null);

  useScrollLock(open);
  useFocusTrap({
    active: open,
    containerRef,
    onEscape: closeOnEscape ? onClose : undefined,
  });
  useFocusReturn({ open });

  // 打开时把焦点移到 initialFocusRef 或容器自身
  // jsdom 无法保证焦点真实移动，浏览器验证
  const handleEnterComplete = () => {
    const target = initialFocusRef?.current ?? containerRef.current;
    target?.focus();
  };

  const handleScrimClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!closeOnScrimClick) return;
    // 仅响应遮罩自身的点击，避免穿透到内容
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const isFullscreen = variant === 'full-screen';

  return (
    <AnimatePresence>
      {open ? (
        <m.div
          className="fixed inset-0 z-[80] flex"
          initial={MOTION_SCRIM.initial}
          animate={MOTION_SCRIM.animate}
          exit={MOTION_SCRIM.exit}
          transition={MOTION_SCRIM.transition}
          style={{ backgroundColor: 'var(--valo-scrim)' }}
          onClick={handleScrimClick}
        >
          <m.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-label={ariaLabel}
            tabIndex={-1}
            ref={containerRef}
            {...(isFullscreen ? MOTION_FULLSCREEN : MOTION_BOTTOM)}
            className={
              isFullscreen
                ? 'absolute inset-0 flex flex-col bg-[var(--valo-surface)] ' +
                  'text-[var(--valo-text-primary)] outline-none ' +
                  className
                : 'absolute bottom-0 left-0 right-0 flex flex-col ' +
                  'rounded-t-2xl border-t border-[var(--valo-border)] ' +
                  'bg-[var(--valo-surface)] text-[var(--valo-text-primary)] ' +
                  'shadow-[var(--valo-shadow-elevated)] outline-none ' +
                  'pt-[env(safe-area-inset-top)] ' +
                  'pb-[env(safe-area-inset-bottom)] ' +
                  className
            }
            style={
              isFullscreen
                ? undefined
                : height
                  ? { maxHeight: typeof height === 'number' ? `${height}px` : height }
                  : undefined
            }
            onClick={(e: MouseEvent<HTMLDivElement>) =>
              e.stopPropagation()
            }
            onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
              // 兜底：焦点已无 tabbable 时 Escape 仍能关闭
              if (e.key === 'Escape' && closeOnEscape) {
                e.stopPropagation();
                onClose();
              }
            }}
            data-valo-touch="true"
            onAnimationComplete={handleEnterComplete}
          >
            {isFullscreen ? null : (
              // 顶部抓手，提示可下拉关闭
              <div className="flex justify-center pt-2 pb-1 shrink-0">
                <span className="block w-10 h-1 rounded-full bg-[var(--valo-border)]" />
              </div>
            )}
            {title ? (
              <SheetHeader title={title} titleId={titleId} onClose={onClose} />
            ) : null}
            <div
              className="flex-1 overflow-y-auto"
              style={
                isFullscreen
                  ? undefined
                  : height
                    ? { maxHeight: typeof height === 'number' ? `${height}px` : height }
                    : undefined
              }
            >
              {children}
            </div>
          </m.div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}

interface SheetHeaderProps {
  title: ReactNode;
  titleId?: string;
  onClose: () => void;
}

function SheetHeader({ title, titleId, onClose }: SheetHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 shrink-0">
      <h2
        id={titleId}
        className="text-base font-semibold text-[var(--valo-text-primary)]"
      >
        {title}
      </h2>
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
        data-valo-touch="true"
        className="rounded-full p-2 text-[var(--valo-text-secondary)] hover:text-[var(--valo-text-primary)] hover:bg-[var(--valo-border)] transition-colors"
      >
        <XMarkIcon className="w-5 h-5" />
      </button>
    </div>
  );
}
