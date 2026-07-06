'use client';

import { useTranslations } from 'next-intl';
import {
  computeRawAmount,
  LIFE_LOG_CATEGORIES,
  type LifeLogCategory,
  type LifeLogEntry,
} from '@/lib/life-log';
import { LifeLogEntryRow } from './LifeLogEntryRow';

/**
 * LifeLogCategorySection —— 单个类目的展示与交互区块。
 *
 * 内容：
 * - 类目标题 + 当前 cups 总和（与对应物理量）。
 * - 两个 CTA：快捷新增（+1 杯）、自定义新增（打开 Sheet）。
 * - 该类目下的所有 entries（按时间倒序，由父组件传入）。
 *
 * 交互：
 * - `onQuickAdd(type)` —— 快捷加 1 杯。
 * - `onCustomAdd(type)` —— 打开自定义新增 Sheet。
 * - `onEdit(entry)` / `onDelete(entry)` —— 由本组件直接转发。
 *
 * 强调色绑定到类目的 accentToken（四态 CSS 变量），不引入硬编码色值。
 */
export interface LifeLogCategorySectionProps {
  type: LifeLogCategory;
  entries: ReadonlyArray<LifeLogEntry>;
  onQuickAdd: (type: LifeLogCategory) => void;
  onCustomAdd: (type: LifeLogCategory) => void;
  onEdit: (entry: LifeLogEntry) => void;
  onDelete: (entry: LifeLogEntry) => void;
}

export function LifeLogCategorySection({
  type,
  entries,
  onQuickAdd,
  onCustomAdd,
  onEdit,
  onDelete,
}: LifeLogCategorySectionProps) {
  const t = useTranslations('lifeLog');
  const config = LIFE_LOG_CATEGORIES[type];

  const totalCups = entries.reduce((sum, e) => sum + e.cups, 0);
  const raw = computeRawAmount(totalCups, config);

  return (
    <section
      data-valo-life-log-section={type}
      className="rounded-2xl border border-[var(--valo-border)]
                 bg-[var(--valo-surface)] p-4
                 shadow-[var(--valo-shadow-card)]"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span aria-hidden="true" className="text-xl leading-none">
            {config.icon}
          </span>
          <h3 className="text-sm font-semibold text-[var(--valo-text-primary)]">
            {t(`category.${type}`)}
          </h3>
        </div>
        <span
          className="text-xs font-semibold tabular-nums"
          style={{ color: `var(${config.accentToken})` }}
          aria-label={t('totalToday', {
            cups: totalCups,
            amount: raw.amount,
            unit: raw.unit,
          })}
        >
          {t('totalToday', {
            cups: totalCups,
            amount: raw.amount,
            unit: raw.unit,
          })}
        </span>
      </header>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onQuickAdd(type)}
          data-valo-touch="true"
          data-valo-life-log-quick-add=""
          className="flex-1 rounded-full px-3 py-2 text-xs font-semibold
                     text-[var(--valo-canvas)]
                     transition-opacity hover:opacity-90
                     focus-visible:outline-none
                     focus-visible:[box-shadow:var(--valo-focus-ring)]"
          style={{ backgroundColor: `var(${config.accentToken})` }}
        >
          {t('quickAdd')}
        </button>
        <button
          type="button"
          onClick={() => onCustomAdd(type)}
          data-valo-touch="true"
          data-valo-life-log-custom-add=""
          className="rounded-full px-3 py-2 text-xs font-semibold
                     border border-[var(--valo-border)]
                     text-[var(--valo-text-primary)]
                     hover:border-[var(--valo-text-secondary)] transition-colors
                     focus-visible:outline-none
                     focus-visible:[box-shadow:var(--valo-focus-ring)]"
        >
          {t('customAdd')}
        </button>
      </div>

      {entries.length > 0 ? (
        <ul className="mt-3 divide-y divide-[var(--valo-border)]">
          {entries.map((entry) => (
            <LifeLogEntryRow
              key={entry.id}
              entry={entry}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      ) : (
        <p
          className="mt-3 text-xs text-[var(--valo-text-secondary)] italic"
          data-valo-life-log-empty=""
        >
          {t('empty')}
        </p>
      )}
    </section>
  );
}
