'use client';

import { useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ValoSheet } from '@/components/valo/ValoSheet';
import { ValoDialog } from '@/components/valo/ValoDialog';
import {
  computeRawAmount,
  DEFAULT_QUICK_CUPS,
  LIFE_LOG_CATEGORIES,
  type LifeLogCategory,
  type LifeLogEntry,
} from '@/lib/life-log';

/**
 * LifeLogEntrySheet —— 自定义新增 / 编辑单条 Life Log 记录的浮层。
 *
 * 双渲染（与 AppointmentSheet / ActionTimerSheet 同构）：
 * - 移动端：ValoSheet（block lg:hidden）
 * - 桌面端：ValoDialog（hidden lg:block）
 *
 * 字段：
 * - cups：数字输入（step 0.5，min 0）
 * - time：datetime-local
 * - note：可选文本
 *
 * 行为契约：
 * - `initialEntry` 存在 → 编辑模式，标题"编辑记录"，预填字段；
 *   保存调用 `onSubmit`，回调内由父组件决定 updateEntry。
 * - `initialEntry` 缺失 → 新增模式，标题"新增记录"，默认 cups = DEFAULT_QUICK_CUPS、
 *   时间 = 当前时间；保存调用 `onSubmit`。
 * - 关闭（Cancel / 遮罩 / Escape）调用 `onClose`，不调用 `onSubmit`。
 */
export interface LifeLogEntrySheetProps {
  open: boolean;
  /** 类目（用于预览原始物理量与图标） */
  type: LifeLogCategory;
  /** 编辑模式下的初始值；新增模式传 undefined */
  initialEntry?: LifeLogEntry | null;
  /** 保存回调：返回的字段已校验（cups>=0，timestamp 非空） */
  onSubmit: (values: EntrySheetValues) => void;
  onClose: () => void;
}

export interface EntrySheetValues {
  cups: number;
  /** ISO 时间字符串 */
  timestamp: string;
  note?: string;
}

export function LifeLogEntrySheet({
  open,
  type,
  initialEntry,
  onSubmit,
  onClose,
}: LifeLogEntrySheetProps) {
  const t = useTranslations('lifeLog');
  const titleId = useId();
  const config = LIFE_LOG_CATEGORIES[type];

  const [cups, setCups] = useState<number>(DEFAULT_QUICK_CUPS);
  const [timeLocal, setTimeLocal] = useState<string>('');
  const [note, setNote] = useState<string>('');

  // 每次打开时重置表单：新增 → 默认值；编辑 → 预填值
  useEffect(() => {
    if (!open) return;
    if (initialEntry) {
      setCups(initialEntry.cups);
      setTimeLocal(toDatetimeLocalValue(initialEntry.timestamp));
      setNote(initialEntry.note ?? '');
    } else {
      setCups(DEFAULT_QUICK_CUPS);
      setTimeLocal(toDatetimeLocalValue(new Date().toISOString()));
      setNote('');
    }
  }, [open, initialEntry]);

  const isEdit = !!initialEntry;
  const titleKey = isEdit ? 'sheetTitleEdit' : 'sheetTitleAdd';
  const title = `${config.icon} ${t(titleKey)}`;

  function handleSubmit() {
    const safeCups = Math.max(0, Number.isFinite(cups) ? cups : 0);
    const iso = fromDatetimeLocalValue(timeLocal);
    onSubmit({
      cups: safeCups,
      timestamp: iso,
      note: note.trim() || undefined,
    });
  }

  const raw = computeRawAmount(
    Number.isFinite(cups) ? Math.max(0, cups) : 0,
    config,
  );

  const body = (
    <div className="px-5 py-6 space-y-5">
      {/* 类目预览 */}
      <div
        className="rounded-xl border border-[var(--valo-border)] p-3
                   text-sm text-[var(--valo-text-secondary)]"
      >
        <span className="font-semibold text-[var(--valo-text-primary)]">
          {config.icon} {t(`category.${type}`)}
        </span>
        <span className="ml-2" style={{ color: `var(${config.accentToken})` }}>
          {raw.amount}
          {raw.unit}
        </span>
      </div>

      <Field label={t('cupsLabel')} htmlFor="life-log-cups">
        <input
          id="life-log-cups"
          type="number"
          inputMode="decimal"
          step={t('cupsStep')}
          min={0}
          value={Number.isFinite(cups) ? cups : 0}
          onChange={(e) => {
            const v = Number(e.target.value);
            setCups(Number.isFinite(v) ? v : 0);
          }}
          data-valo-life-log-cups=""
          className="w-full rounded-lg border border-[var(--valo-border)]
                     bg-[var(--valo-canvas)]
                     px-3 py-2 text-sm text-[var(--valo-text-primary)]
                     focus-visible:outline-none
                     focus-visible:[box-shadow:var(--valo-focus-ring)]"
        />
      </Field>

      <Field label={t('time')} htmlFor="life-log-time">
        <input
          id="life-log-time"
          type="datetime-local"
          value={timeLocal}
          onChange={(e) => setTimeLocal(e.target.value)}
          data-valo-life-log-time=""
          className="w-full rounded-lg border border-[var(--valo-border)]
                     bg-[var(--valo-canvas)]
                     px-3 py-2 text-sm text-[var(--valo-text-primary)]
                     focus-visible:outline-none
                     focus-visible:[box-shadow:var(--valo-focus-ring)]"
        />
      </Field>

      <Field label={t('note')} htmlFor="life-log-note">
        <textarea
          id="life-log-note"
          rows={2}
          value={note}
          placeholder={t('notePlaceholder')}
          onChange={(e) => setNote(e.target.value)}
          data-valo-life-log-note=""
          className="w-full rounded-lg border border-[var(--valo-border)]
                     bg-[var(--valo-canvas)]
                     px-3 py-2 text-sm text-[var(--valo-text-primary)]
                     resize-none
                     focus-visible:outline-none
                     focus-visible:[box-shadow:var(--valo-focus-ring)]"
        />
      </Field>

      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          onClick={handleSubmit}
          data-valo-touch="true"
          data-valo-life-log-save=""
          className="w-full rounded-full px-4 py-3 text-sm font-semibold
                     bg-[var(--valo-prime)] text-[var(--valo-canvas)]
                     hover:opacity-90 transition-opacity
                     focus-visible:outline-none
                     focus-visible:[box-shadow:var(--valo-focus-ring)]"
        >
          {t('save')}
        </button>
        <button
          type="button"
          onClick={onClose}
          data-valo-touch="true"
          className="w-full rounded-full px-4 py-2 text-sm font-semibold
                     border border-[var(--valo-border)]
                     text-[var(--valo-text-primary)]
                     hover:border-[var(--valo-text-secondary)] transition-colors
                     focus-visible:outline-none
                     focus-visible:[box-shadow:var(--valo-focus-ring)]"
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

interface FieldProps {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}

function Field({ label, htmlFor, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-xs font-semibold uppercase tracking-wider
                   text-[var(--valo-text-secondary)]"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * ISO timestamp → datetime-local 控件所需的 `YYYY-MM-DDTHH:MM` 格式。
 *
 * 失败回退到空串，让控件显示 placeholder（少数浏览器对非法 value 会拒绝）。
 */
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/**
 * datetime-local 值 → ISO 字符串。
 *
 * 空值回退到当前时间，避免提交空字符串。
 */
function fromDatetimeLocalValue(local: string): string {
  if (!local) return new Date().toISOString();
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}
