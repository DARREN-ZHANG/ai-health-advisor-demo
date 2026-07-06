'use client';

import { useTranslations } from 'next-intl';
import { ValoConfirmDialog } from '@/components/valo/ValoConfirmDialog';

/**
 * 时间轴重置确认弹窗。
 *
 * - 基于 `ValoConfirmDialog`（tone=danger）。
 * - 由 `DemoControlDrawer` 底部“重置”按钮打开；
 *   只有用户在此弹窗中点击“重置”后，才会触发真正的 `resetTimeline` mutation。
 * - `onConfirm` 对应 `useDemoControlActions().onReset`。
 * - `loading` 用于把确认按钮置灰（pendingAction === 'reset' 时）。
 *
 * 文案：
 * - 标题/描述/动作/取消都走 next-intl 的 demoControl.* 命名空间，
 *   保证 zh/en 双语切换。
 */
export interface TimelineResetDialogProps {
  open: boolean;
  onClose: () => void;
  /** 用户确认后调用；调用方负责执行 mutation 与关闭弹窗 */
  onConfirm: () => void;
  /** 确认按钮禁用态（重置进行中） */
  loading?: boolean;
}

export function TimelineResetDialog({
  open,
  onClose,
  onConfirm,
  loading = false,
}: TimelineResetDialogProps) {
  const t = useTranslations('demoControl');
  return (
    <ValoConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      tone="danger"
      title={t('resetConfirmTitle')}
      description={t('resetConfirmDescription')}
      confirmLabel={t('resetConfirmAction')}
      cancelLabel={t('resetConfirmCancel')}
      confirmDisabled={loading}
      ariaLabel={t('resetConfirmTitle')}
    />
  );
}
