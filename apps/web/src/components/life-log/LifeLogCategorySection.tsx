'use client';

import { useTranslations } from 'next-intl';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import {
  computeRawAmount,
  LIFE_LOG_CATEGORIES,
  type LifeLogCategory,
  type LifeLogEntry,
} from '@/lib/life-log';

/**
 * LifeLogCategorySection —— 单个类目的展示与交互区块。
 *
 * 内容：
 * - 类目标题 + 与 Figma 原稿一致的右侧单位摘要。
 * - 单个紧凑 icon CTA：打开自定义新增 Sheet。
 * - 该类目下的已有 entries 以紧凑子行展示。
 *
 * 交互：
 * - `onCustomAdd(type)` —— 打开自定义新增 Sheet。
 * - `onEdit(entry)` / `onDelete(entry)` —— 由本组件直接转发。
 *
 * 强调色绑定到类目的 accentToken（四态 CSS 变量），不引入硬编码色值。
 */
export interface LifeLogCategorySectionProps {
  type: LifeLogCategory;
  entries: ReadonlyArray<LifeLogEntry>;
  onOpen: (type: LifeLogCategory) => void;
}

export function LifeLogCategorySection({
  type,
  entries,
  onOpen,
}: LifeLogCategorySectionProps) {
  const t = useTranslations('lifeLog');
  const config = LIFE_LOG_CATEGORIES[type];

  const totalCups = entries.reduce((sum, e) => sum + e.cups, 0);
  const raw = computeRawAmount(totalCups, config);
  const visualUnit = type === 'hydration' ? 'ml' : 'drinks';
  const visualAmount =
    totalCups > 0 ? (type === 'hydration' ? raw.amount : totalCups) : '-';

  return (
    <section
      data-valo-life-log-section={type}
      className="rounded-md border border-white/[0.03]
                 bg-[rgba(24,23,35,0.94)]
                 shadow-[0_12px_28px_rgba(0,0,0,0.22),inset_0_-10px_22px_rgba(79,42,160,0.16)]"
    >
      <header className="flex min-h-[54px] items-center justify-between gap-3 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="text-sm leading-[18px]">
            {config.icon}
          </span>
          <h3 className="truncate text-sm font-semibold leading-[18px] text-[var(--valo-text-primary)]">
            {t(`category.${type}`)}
          </h3>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span
            className="text-sm leading-[18px] text-[var(--valo-text-secondary)]"
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
            onClick={() => onOpen(type)}
            data-valo-life-log-custom-add=""
            className="grid h-[22px] w-[22px] place-items-center rounded-[5px]
                       border border-white/15 bg-white/[0.025]
                       text-[13px] leading-none text-[var(--valo-text-secondary)]
                       transition-colors hover:border-white/30 hover:text-[var(--valo-text-primary)]
                       focus-visible:outline-none
                       focus-visible:[box-shadow:var(--valo-focus-ring)]"
          >
            <ChevronRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">{t('customAdd')}</span>
          </button>
        </div>
      </header>
    </section>
  );
}
