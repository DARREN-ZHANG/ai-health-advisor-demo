'use client';

import { useRef } from 'react';
import { ChevronRightIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import { useOverlayBehavior } from '@/components/valo/hooks/useOverlayBehavior';
import {
  computeRawAmount,
  getTimeOfDay,
  LIFE_LOG_CATEGORIES,
  type LifeLogCategory,
  type LifeLogEntry,
} from '@/lib/life-log';

interface LifeLogCategoryDialogProps {
  type: LifeLogCategory;
  entries: ReadonlyArray<LifeLogEntry>;
  pending?: boolean;
  onClose: () => void;
  onQuickAdd: () => void;
  onCustomAdd: () => void;
  onEdit: (entry: LifeLogEntry) => void;
}

export function LifeLogCategoryDialog({
  type,
  entries,
  pending = false,
  onClose,
  onQuickAdd,
  onCustomAdd,
  onEdit,
}: LifeLogCategoryDialogProps) {
  const t = useTranslations('lifeLog');
  const config = LIFE_LOG_CATEGORIES[type];
  const quickAmount = type === 'hydration' ? '250ml' : `1 ${t('drink')}`;
  const dialogRef = useRef<HTMLElement>(null);
  const { handleScrimClick } = useOverlayBehavior({
    open: true,
    containerRef: dialogRef,
    onClose,
  });

  return (
    <div
      className="fixed inset-0 z-[90] flex justify-center bg-black/80"
      onClick={handleScrimClick}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t(`category.${type}`)}
        data-valo-life-log-category-dialog={type}
        className="relative flex h-[100dvh] w-full max-w-[430px] flex-col bg-[#171620] text-white"
      >
        <header className="relative flex h-16 shrink-0 items-center justify-center px-4 pt-2">
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="absolute left-4 grid h-7 w-7 place-items-center rounded-full bg-[#0e0d13] text-[#8e8c98]"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
          <h2 className="text-[13px] font-medium">{t(`category.${type}`)}</h2>
        </header>

        <div className="flex min-h-0 flex-1 flex-col px-4 pb-24">
          <div className="flex items-center justify-between py-3 text-[11px]">
            <h3 className="font-medium">{t('todaysEntries')}</h3>
            <span className="text-[#777581]">
              {t('recommended', {
                amount: type === 'caffeine' ? '400mg' : type === 'hydration' ? '1,000ml' : '0',
              })}
            </span>
          </div>

          {entries.length > 0 ? (
            <ul className="divide-y divide-white/[0.04]">
              {entries.map((entry) => {
                const raw = computeRawAmount(entry.cups, config);
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => onEdit(entry)}
                      data-valo-life-log-entry={entry.id}
                      className="flex min-h-14 w-full items-center gap-3 py-2 text-left"
                    >
                      <span aria-hidden="true" className="text-base">{config.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12px] font-medium">
                          {t(`category.${type}`)}
                        </span>
                        <time className="block text-[10px] text-[#777581]">
                          {getTimeOfDay(entry.timestamp)}
                        </time>
                      </span>
                      <span className="text-[11px] text-[#aaa8b2]">
                        {type === 'hydration'
                          ? `${raw.amount}${raw.unit}`
                          : `${formatAmount(entry.cups)} ${t('drink')} (${raw.amount}${raw.unit})`}
                      </span>
                      <ChevronRightIcon className="h-3 w-3 text-[#55535e]" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="sr-only">{t('empty')}</p>
          )}
        </div>

        <footer className="absolute inset-x-0 bottom-0 flex gap-3 bg-[#171620] px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-3">
          <ActionButton
            disabled={pending}
            label={t('addQuick', { amount: quickAmount })}
            onClick={onQuickAdd}
          />
          <ActionButton
            disabled={pending}
            label={t('customAdd')}
            onClick={onCustomAdd}
          />
        </footer>
      </section>
    </div>
  );
}

function ActionButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-10 flex-1 items-center justify-center gap-1 rounded-full bg-[#343241] px-3 text-[11px] font-medium text-[#eeecf2] disabled:opacity-50"
    >
      <PlusIcon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
