'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ValoCard } from '@/components/valo/ValoCard';
import type { ActionOption } from '@health-advisor/shared';

/**
 * ActionCard —— Yes / Not Now 单卡。
 *
 * 行为契约（来自 I3.2）：
 * - 任一按钮点击后，卡片收起为一行摘要（不卸载，保留可访问性）。
 * - `pending=true` 时禁用按钮，Yes 按钮显示 spinner。
 * - 仅引用 `--valo-*` token；不出现硬编码颜色。
 *
 * 采用非受控模式（内部 `useState` 跟踪 collapsed），保持 API 简单；
 * 受控用法留给上层渲染时直接跳过该卡。
 */
export interface ActionCardProps {
  action: ActionOption;
  onYes: (action: ActionOption) => void;
  onNotNow: (action: ActionOption) => void;
  /** 交互后是否收起；默认 true */
  collapseOnInteract?: boolean;
  /** 当前是否正在 pending（loading） */
  pending?: boolean;
}

export function ActionCard({
  action,
  onYes,
  onNotNow,
  collapseOnInteract = true,
  pending = false,
}: ActionCardProps) {
  const t = useTranslations('homepage.action');
  const [collapsed, setCollapsed] = useState(false);
  const [outcome, setOutcome] = useState<'recorded' | 'dismissed' | null>(null);

  function handleYes() {
    if (pending) return;
    if (collapseOnInteract) {
      setCollapsed(true);
      setOutcome('recorded');
    }
    onYes(action);
  }

  function handleNotNow() {
    if (pending) return;
    if (collapseOnInteract) {
      setCollapsed(true);
      setOutcome('dismissed');
    }
    onNotNow(action);
  }

  if (collapsed) {
    return (
      <ValoCard as="li" className="py-2">
        <p
          className="text-sm text-[var(--valo-text-secondary)] truncate"
          aria-live="polite"
        >
          <span className="font-medium text-[var(--valo-text-primary)]">
            {action.title}
          </span>
          {' — '}
          {outcome === 'recorded' ? t('recorded') : t('dismissed')}
        </p>
      </ValoCard>
    );
  }

  return (
    <ValoCard as="li" className="space-y-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {action.emoji ? (
            <span aria-hidden="true" className="text-base">
              {action.emoji}
            </span>
          ) : null}
          <h3 className="text-sm font-semibold text-[var(--valo-text-primary)]">
            {action.title}
          </h3>
        </div>
        {action.description ? (
          <p className="text-xs text-[var(--valo-text-secondary)] leading-relaxed">
            {action.description}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleYes}
          disabled={pending}
          data-valo-touch="true"
          aria-busy={pending}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold
                     bg-[var(--valo-prime)] text-[var(--valo-canvas)]
                     hover:opacity-90 transition-opacity
                     focus-visible:outline-none focus-visible:[box-shadow:var(--valo-focus-ring)]
                     disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pending ? (
            <span
              aria-hidden="true"
              className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin"
            />
          ) : null}
          {t('yes')}
        </button>
        <button
          type="button"
          onClick={handleNotNow}
          disabled={pending}
          data-valo-touch="true"
          className="rounded-full px-4 py-2 text-sm font-semibold
                     border border-[var(--valo-border)]
                     text-[var(--valo-text-secondary)]
                     hover:text-[var(--valo-text-primary)] hover:border-[var(--valo-text-secondary)]
                     transition-colors
                     focus-visible:outline-none focus-visible:[box-shadow:var(--valo-focus-ring)]
                     disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {t('notNow')}
        </button>
      </div>
    </ValoCard>
  );
}
