'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { ValoSheet } from '@/components/valo/ValoSheet';
import { ValoDialog } from '@/components/valo/ValoDialog';

/**
 * AppointmentSheet —— 日历行动的"仅确认"浮层。
 *
 * 关键约束（来自 I3.2）：
 * - 仅记录当前会话内的确认；**不**调用 window.open，也**不**调用任何外部日历 API。
 * - “Add to Calendar”按钮触发 `onConfirm` 后关闭。
 * - “Cancel”按钮仅关闭，不触发 `onConfirm`。
 *
 * 双渲染：移动端 Sheet（block lg:hidden）+ 桌面端 Dialog（hidden lg:block）。
 */
export interface AppointmentSheetProps {
  open: boolean;
  onClose: () => void;
  /** 确认回调（仅记录，不调用日历） */
  onConfirm: () => void;
  title: string;
  description?: string;
}

export function AppointmentSheet({
  open,
  onClose,
  onConfirm,
  title,
  description,
}: AppointmentSheetProps) {
  const t = useTranslations('homepage.appointment');
  const titleId = useId();

  function handleConfirm() {
    onConfirm();
    onClose();
  }

  const body = (
    <div className="px-5 py-6 space-y-5">
      {description ? (
        <p className="text-sm text-[var(--valo-text-secondary)] leading-relaxed whitespace-pre-line">
          {description}
        </p>
      ) : null}

      <p className="text-xs text-[var(--valo-text-secondary)] italic">
        {t('disclaimer')}
      </p>

      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          onClick={handleConfirm}
          data-valo-touch="true"
          className="w-full rounded-full px-4 py-3 text-sm font-semibold
                     bg-[var(--valo-prime)] text-[var(--valo-canvas)]
                     hover:opacity-90 transition-opacity
                     focus-visible:outline-none focus-visible:[box-shadow:var(--valo-focus-ring)]"
        >
          {t('confirm')}
        </button>
        <button
          type="button"
          onClick={onClose}
          data-valo-touch="true"
          className="w-full rounded-full px-4 py-2 text-sm font-semibold
                     border border-[var(--valo-border)]
                     text-[var(--valo-text-primary)]
                     hover:border-[var(--valo-text-secondary)] transition-colors
                     focus-visible:outline-none focus-visible:[box-shadow:var(--valo-focus-ring)]"
        >
          {t('cancel')}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="block lg:hidden">
        <ValoSheet
          open={open}
          onClose={onClose}
          title={title}
          ariaLabelledBy={titleId}
        >
          <div id={titleId} className="sr-only">
            {title}
          </div>
          {body}
        </ValoSheet>
      </div>

      <div className="hidden lg:block">
        <ValoDialog
          open={open}
          onClose={onClose}
          title={title}
          ariaLabelledBy={titleId}
          width="sm"
        >
          <div id={titleId} className="sr-only">
            {title}
          </div>
          {body}
        </ValoDialog>
      </div>
    </>
  );
}
