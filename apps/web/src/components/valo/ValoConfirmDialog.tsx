'use client';

import { type ReactNode } from 'react';
import { ValoDialog } from './ValoDialog';

/**
 * ValoConfirmDialog —— 基于 ValoDialog 的确认弹窗。
 *
 * 用途：
 * - I2.3 reset timeline、I3.2 timer stop 等通用确认流程。
 *
 * 默认文案：
 * - 调用方可以通过 `confirmLabel` / `cancelLabel` 自定义，否则使用中英双语
 *   兼容的兜底字面量。I7.1 会接入 next-intl 统一替换。
 *
 * tone：
 * - `default`：使用 Prime 紫色（--valo-prime）作为确认按钮主色。
 * - `danger`：使用 Depleted 红色（--valo-depleted），用于不可逆操作。
 */
export type ValoConfirmTone = 'default' | 'danger';

export interface ValoConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  /** 确认回调；调用方应在内部完成业务后再 close */
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ValoConfirmTone;
  /** 禁用确认按钮（例如异步进行中） */
  confirmDisabled?: boolean;
  ariaLabelledBy?: string;
  ariaLabel?: string;
}

const CONFIRM_TEXT_DEFAULT = '确认';
const CANCEL_TEXT_DEFAULT = '取消';

export function ValoConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = CONFIRM_TEXT_DEFAULT,
  cancelLabel = CANCEL_TEXT_DEFAULT,
  tone = 'default',
  confirmDisabled = false,
  ariaLabelledBy,
  ariaLabel,
}: ValoConfirmDialogProps) {
  const confirmToken =
    tone === 'danger'
      ? 'var(--valo-depleted)'
      : 'var(--valo-prime)';

  return (
    <ValoDialog
      open={open}
      onClose={onClose}
      title={title}
      width="sm"
      ariaLabelledBy={ariaLabelledBy}
      ariaLabel={ariaLabel}
    >
      <div className="px-5 pb-5 space-y-5">
        {description ? (
          <p className="text-sm text-[var(--valo-text-secondary)] leading-relaxed">
            {description}
          </p>
        ) : null}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            data-valo-touch="true"
            className="px-4 py-2 rounded-xl text-sm font-medium border border-[var(--valo-border)] text-[var(--valo-text-secondary)] hover:text-[var(--valo-text-primary)] hover:bg-[var(--valo-border)] transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            data-valo-touch="true"
            style={{ backgroundColor: confirmToken }}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-[var(--valo-canvas)] hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </ValoDialog>
  );
}
