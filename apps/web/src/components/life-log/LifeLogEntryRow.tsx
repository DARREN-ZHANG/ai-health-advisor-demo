'use client';

import { useTranslations } from 'next-intl';
import {
  computeRawAmount,
  LIFE_LOG_CATEGORIES,
  type LifeLogEntry,
} from '@/lib/life-log';

/**
 * LifeLogEntryRow —— 单条 Life Log 记录的行视图。
 *
 * 展示：时间、杯数、原始物理量、备注（若有），以及编辑 / 删除按钮。
 *
 * 设计要点：
 * - 仅展示，不持有状态；所有交互通过 `onEdit` / `onDelete` 上抛。
 * - 强调色绑定到类目的 accentToken（四态 CSS 变量），不引入硬编码色值。
 * - 时间显示用 `toLocaleTimeString` 的 24h 简短格式（仅时:分），
 *   完整时间戳由 title 属性提供，便于鼠标悬停查看。
 */
export interface LifeLogEntryRowProps {
  entry: LifeLogEntry;
  onEdit: (entry: LifeLogEntry) => void;
  onDelete: (entry: LifeLogEntry) => void;
}

export function LifeLogEntryRow({
  entry,
  onEdit,
  onDelete,
}: LifeLogEntryRowProps) {
  const t = useTranslations('lifeLog');
  const config = LIFE_LOG_CATEGORIES[entry.type];
  const raw = computeRawAmount(entry.cups, config);
  const time = formatShortTime(entry.timestamp);

  return (
    <li
      className="flex items-center gap-2 rounded-md bg-black/10 px-2 py-1.5"
      data-valo-life-log-entry={entry.id}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <time
            dateTime={entry.timestamp}
            title={entry.timestamp}
            className="text-[12px] font-medium text-[var(--valo-text-secondary)]"
          >
            {time}
          </time>
          <span
            className="text-[12px] font-semibold leading-none"
            style={{ color: `var(${config.accentToken})` }}
          >
            {entry.cups}
            {t('unit.cup')} · {raw.amount}
            {raw.unit}
          </span>
        </div>
        {entry.note ? (
          <p className="mt-0.5 break-words text-[12px] leading-snug text-[var(--valo-text-secondary)]">
            {entry.note}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onEdit(entry)}
          aria-label={t('edit')}
          data-valo-touch="true"
          className="grid h-6 w-6 place-items-center rounded-[5px]
                     border border-white/10 bg-white/[0.02]
                     text-[12px] text-[var(--valo-text-secondary)]
                     hover:border-white/25 hover:text-[var(--valo-text-primary)]
                     transition-colors
                     focus-visible:outline-none
                     focus-visible:[box-shadow:var(--valo-focus-ring)]"
        >
          <span aria-hidden="true">✓</span>
        </button>
        <button
          type="button"
          onClick={() => onDelete(entry)}
          aria-label={t('delete')}
          data-valo-touch="true"
          className="grid h-6 w-6 place-items-center rounded-[5px]
                     border border-white/10 bg-white/[0.02]
                     text-[12px] text-[var(--valo-text-secondary)]
                     hover:border-white/25 hover:text-[var(--valo-depleted)]
                     transition-colors
                     focus-visible:outline-none
                     focus-visible:[box-shadow:var(--valo-focus-ring)]"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </li>
  );
}

/**
 * 把 ISO timestamp 转为 `HH:MM`（24h）展示字符串。
 *
 * 解析失败时回退到原始字符串，避免组件崩溃。
 */
function formatShortTime(timestamp: string): string {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return timestamp;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
