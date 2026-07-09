'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeftIcon,
  MinusIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import { useOverlayBehavior } from '@/components/valo/hooks/useOverlayBehavior';
import {
  computeRawAmount,
  DEFAULT_QUICK_CUPS,
  getTimeOfDay,
  LIFE_LOG_CATEGORIES,
  type LifeLogCategory,
  type LifeLogEntry,
} from '@/lib/life-log';

export interface LifeLogEntrySheetProps {
  open: boolean;
  type: LifeLogCategory;
  defaultTime: string;
  initialEntry?: LifeLogEntry | null;
  pending?: boolean;
  onSubmit: (values: EntrySheetValues) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export interface EntrySheetValues {
  cups: number;
  timeOfDay: string;
}

export function LifeLogEntrySheet({
  open,
  type,
  defaultTime,
  initialEntry,
  pending = false,
  onSubmit,
  onDelete,
  onClose,
}: LifeLogEntrySheetProps) {
  const t = useTranslations('lifeLog');
  const config = LIFE_LOG_CATEGORIES[type];
  const [cups, setCups] = useState(DEFAULT_QUICK_CUPS);
  const [timeOfDay, setTimeOfDay] = useState(defaultTime);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const sheetRef = useRef<HTMLElement>(null);
  const { handleScrimClick } = useOverlayBehavior({
    open: open && !timePickerOpen,
    containerRef: sheetRef,
    onClose,
  });

  useEffect(() => {
    if (!open) return;
    setCups(initialEntry?.cups ?? DEFAULT_QUICK_CUPS);
    setTimeOfDay(
      initialEntry ? getTimeOfDay(initialEntry.timestamp) : defaultTime,
    );
    setTimePickerOpen(false);
  }, [defaultTime, initialEntry, open]);

  if (!open) return null;

  const raw = computeRawAmount(cups, config);
  const isEdit = !!initialEntry;
  const step = 1;
  const amountLabel =
    type === 'hydration'
      ? `${raw.amount}ml`
      : `${formatAmount(cups)} ${t('drink')}`;

  return (
    <>
      <div
        aria-hidden={timePickerOpen ? true : undefined}
        className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75"
        onClick={handleScrimClick}
      >
        <section
          ref={sheetRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={isEdit ? t('sheetTitleEdit') : t('customAdd')}
          className="w-full max-w-[430px] rounded-t-[12px] bg-[#181720] px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-4 text-white"
          data-valo-life-log-entry-sheet=""
        >
          <header className="relative flex h-8 items-center justify-center">
            <button
              type="button"
              onClick={onClose}
              aria-label={t('back')}
              className="absolute left-0 grid h-7 w-7 place-items-center rounded-full bg-[#0e0d13] text-[#96949e]"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <h2 className="text-[12px] font-medium">
              {isEdit ? t('edit') : t('customAdd')}
            </h2>
            {isEdit && onDelete ? (
              <button
                type="button"
                disabled={pending}
                onClick={onDelete}
                aria-label={t('delete')}
                className="absolute right-0 grid h-7 w-7 place-items-center text-[#ff454d] disabled:opacity-50"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            ) : null}
          </header>

          <div className="flex items-center justify-center gap-8 py-4">
            <CounterButton
              label={t('decrease')}
              onClick={() => setCups((value) => Math.max(step, value - step))}
            >
              <MinusIcon className="h-4 w-4" />
            </CounterButton>

            <div className="min-w-[110px] text-center">
              <div className="text-[20px] font-medium leading-6">{amountLabel}</div>
              {type !== 'hydration' ? (
                <div className="text-[11px] text-[#777581]">
                  ({raw.amount}{raw.unit})
                </div>
              ) : null}
            </div>

            <CounterButton
              label={t('increase')}
              onClick={() => setCups((value) => value + step)}
            >
              <PlusIcon className="h-4 w-4" />
            </CounterButton>
          </div>

          <button
            type="button"
            onClick={() => setTimePickerOpen(true)}
            data-valo-life-log-time=""
            className="flex h-11 w-full items-center justify-between rounded-md bg-[#272631] px-3 text-[11px]"
          >
            <span>{t('time')}</span>
            <span className="flex items-center gap-2 text-[#d2d0d8]">
              {timeOfDay}
              <span aria-hidden="true">›</span>
            </span>
          </button>

          <button
            type="button"
            disabled={pending}
            onClick={() => onSubmit({ cups, timeOfDay })}
            data-valo-life-log-save=""
            className="mt-4 h-10 w-full rounded-full bg-[#454358] text-[11px] font-medium disabled:opacity-50"
          >
            {isEdit ? t('update') : t('add')}
          </button>
        </section>
      </div>

      {timePickerOpen ? (
        <TimePicker
          value={timeOfDay}
          onChange={setTimeOfDay}
          onClose={() => setTimePickerOpen(false)}
        />
      ) : null}
    </>
  );
}

function CounterButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-7 w-7 place-items-center rounded-full bg-[#2d2c37] text-[#bbb9c2]"
    >
      {children}
    </button>
  );
}

function TimePicker({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('lifeLog');
  const pickerRef = useRef<HTMLElement>(null);
  const { handleScrimClick } = useOverlayBehavior({
    open: true,
    containerRef: pickerRef,
    onClose,
  });

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/80"
      onClick={handleScrimClick}
    >
      <section
        ref={pickerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t('selectTime')}
        className="w-full max-w-[430px] rounded-t-[12px] bg-[#181720] px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-4 text-white"
      >
        <header className="relative flex h-8 items-center justify-center">
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="absolute left-0 grid h-7 w-7 place-items-center rounded-full bg-[#0e0d13] text-[#96949e]"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <h3 className="text-[12px] font-medium">{t('time')}</h3>
        </header>

        <div className="my-6 flex justify-center">
          <input
            type="time"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="rounded-lg bg-[#272631] px-8 py-3 text-center text-xl [color-scheme:dark]"
          />
        </div>

        <button
          type="button"
          onClick={onClose}
          className="h-10 w-full rounded-full bg-[#454358] text-[11px] font-medium"
        >
          {t('done')}
        </button>
      </section>
    </div>
  );
}

function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
