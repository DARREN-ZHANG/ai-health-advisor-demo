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
 * - 类目标题 + 与 Figma 原稿一致的右侧单位摘要。
 * - 两个紧凑 icon CTA：快捷新增（+1 杯）、自定义新增（打开 Sheet）。
 * - 该类目下的已有 entries 以紧凑子行展示。
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
  const visualUnit = type === 'hydration' ? 'ml' : 'drinks';
  const visualAmount = totalCups > 0 ? raw.amount : '-';

  return (
    <section
      data-valo-life-log-section={type}
      className="rounded-lg border border-white/[0.03]
                 bg-[rgba(24,23,35,0.94)]
                 shadow-[0_12px_28px_rgba(0,0,0,0.22),inset_0_-10px_22px_rgba(79,42,160,0.16)]"
    >
      <header className="flex min-h-[56px] items-center justify-between gap-3 px-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="text-[15px] leading-none">
            {config.icon}
          </span>
          <h3 className="truncate text-[16px] font-semibold leading-none text-[var(--valo-text-primary)]">
            {t(`category.${type}`)}
          </h3>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className="text-[14px] leading-none text-[var(--valo-text-secondary)]"
            aria-hidden="true"
          >
            {visualAmount} {visualUnit}
          </span>
          <span className="sr-only">
            {t('totalToday', {
              cups: totalCups,
              amount: raw.amount,
              unit: raw.unit,
            })}
          </span>
          <button
            type="button"
            onClick={() => onQuickAdd(type)}
            data-valo-touch="true"
            data-valo-life-log-quick-add=""
            className="grid h-6 w-6 place-items-center rounded-[5px]
                       border border-white/15 bg-white/[0.03]
                       text-[15px] leading-none text-[var(--valo-text-secondary)]
                       transition-colors hover:border-white/30 hover:text-[var(--valo-text-primary)]
                       focus-visible:outline-none
                       focus-visible:[box-shadow:var(--valo-focus-ring)]"
          >
            <span aria-hidden="true">↗</span>
            <span className="sr-only">{t('quickAdd')}</span>
          </button>
          <button
            type="button"
            onClick={() => onCustomAdd(type)}
            data-valo-touch="true"
            data-valo-life-log-custom-add=""
            className="grid h-6 w-6 place-items-center rounded-[5px]
                       border border-white/15 bg-white/[0.03]
                       text-[14px] leading-none text-[var(--valo-text-secondary)]
                       transition-colors hover:border-white/30 hover:text-[var(--valo-text-primary)]
                       focus-visible:outline-none
                       focus-visible:[box-shadow:var(--valo-focus-ring)]"
          >
            <span aria-hidden="true">+</span>
            <span className="sr-only">{t('customAdd')}</span>
          </button>
        </div>
      </header>

      {entries.length > 0 ? (
        <ul className="space-y-1 border-t border-white/[0.04] px-3.5 py-2">
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
          className="sr-only"
          data-valo-life-log-empty=""
        >
          {t('empty')}
        </p>
      )}
    </section>
  );
}
