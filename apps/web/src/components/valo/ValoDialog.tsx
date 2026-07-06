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
import { useOverlayBehavior } from './hooks/useOverlayBehavior';
import {
  MOTION_CENTERED,
  MOTION_DRAWER,
  MOTION_SCRIM,
} from './motion';

/**
 * ValoDialog —— Valo 设计系统的居中弹窗与右侧 Drawer。
 *
 * 设计要点（来自 design-manifest.md）：
 * - `variant='centered'`（默认）：桌面端居中弹窗。Switch Status 桌面 ~420px，
 *   Switch Account 桌面居中 Dialog。
 * - `variant='drawer'`：右侧 Drawer。Demo Control 桌面 480px。
 * - 黑色半透明遮罩 `--valo-scrim`，点击关闭（可禁用）。
 * - `--valo-surface` 背景、`--valo-shadow-elevated` 阴影、`--valo-border` 弱边框。
 *
 * 与 ValoSheet 的区别：
 * - Sheet 锚定到屏幕底部或全屏覆盖；Dialog 在屏幕中央或右侧。
 * - 调用方负责按视口决定使用 Sheet 还是 Dialog（响应式 CSS，不在此处运行时判断）。
 *
 * 可访问性：role=dialog / aria-modal / 焦点约束 / Escape / 焦点返回。
 */
export type ValoDialogVariant = 'centered' | 'drawer';

export type ValoDialogWidth = 'sm' | 'md' | 'lg' | number;

const WIDTH_MAP: Readonly<Record<'sm' | 'md' | 'lg', string>> = {
  sm: '420px',
  md: '480px',
  lg: '640px',
};

export interface ValoDialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  ariaLabelledBy?: string;
  ariaLabel?: string;
  variant?: ValoDialogVariant;
  /** 宽度：sm=420 / md=480 / lg=640；或自定义 px 数值 */
  width?: ValoDialogWidth;
  closeOnScrimClick?: boolean;
  closeOnEscape?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** 显式触发器 ref；关闭后焦点归还此元素（不传则回退到打开瞬间的 activeElement） */
  triggerRef?: RefObject<HTMLElement | null>;
  className?: string;
}

export function ValoDialog({
  open,
  onClose,
  children,
  title,
  ariaLabelledBy,
  ariaLabel,
  variant = 'centered',
  width = 'md',
  closeOnScrimClick = true,
  closeOnEscape = true,
  initialFocusRef,
  triggerRef,
  className = '',
}: ValoDialogProps) {
  const generatedId = useId();
  const titleId = ariaLabelledBy ?? (title ? generatedId : undefined);

  if (!titleId && !ariaLabel) {
    throw new Error(
      'ValoDialog: 必须提供 ariaLabel 或 ariaLabelledBy（或 title）以提供可访问名',
    );
  }

  const containerRef = useRef<HTMLDivElement>(null);

  const { handleScrimClick } = useOverlayBehavior({
    open,
    containerRef,
    onClose,
    closeOnScrimClick,
    closeOnEscape,
    initialFocusRef,
    triggerRef,
  });

  const resolvedWidth =
    typeof width === 'number' ? `${width}px` : (WIDTH_MAP[width] ?? width);

  const isDrawer = variant === 'drawer';

  return (
    <AnimatePresence>
      {open ? (
        <m.div
          className={
            isDrawer
              ? 'fixed inset-0 z-[80]'
              : 'fixed inset-0 z-[80] flex items-center justify-center p-4'
          }
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
            {...(isDrawer ? MOTION_DRAWER : MOTION_CENTERED)}
            className={
              isDrawer
                ? 'absolute top-0 right-0 bottom-0 flex flex-col ' +
                  'bg-[var(--valo-surface)] text-[var(--valo-text-primary)] ' +
                  'border-l border-[var(--valo-border)] ' +
                  'shadow-[var(--valo-shadow-elevated)] outline-none ' +
                  'pt-[env(safe-area-inset-top)] ' +
                  'pb-[env(safe-area-inset-bottom)] ' +
                  className
                : 'flex flex-col rounded-2xl border border-[var(--valo-border)] ' +
                  'bg-[var(--valo-surface)] text-[var(--valo-text-primary)] ' +
                  'shadow-[var(--valo-shadow-elevated)] outline-none ' +
                  'max-h-[90dvh] ' +
                  className
            }
            style={{ width: resolvedWidth }}
            onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}
            onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
              if (e.key === 'Escape' && closeOnEscape) {
                e.stopPropagation();
                onClose();
              }
            }}
            data-valo-touch="true"
          >
            {title ? (
              <DialogHeader title={title} titleId={titleId} onClose={onClose} />
            ) : null}
            <div className="flex-1 overflow-y-auto">{children}</div>
          </m.div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}

interface DialogHeaderProps {
  title: ReactNode;
  titleId?: string;
  onClose: () => void;
}

function DialogHeader({ title, titleId, onClose }: DialogHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4 shrink-0">
      <h2
        id={titleId}
        className="text-lg font-semibold text-[var(--valo-text-primary)]"
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
