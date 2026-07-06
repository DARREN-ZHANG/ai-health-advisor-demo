'use client';

import { useDataCenterStore } from '@/stores/data-center.store';
import { useTranslations } from 'next-intl';
import type { DataTab, Timeframe } from '@health-advisor/shared';

/**
 * DataCenterControls —— Trends 页面顶部控制卡。
 *
 * 设计意图（来自 design-manifest.md / Valo 设计系统）：
 * - 顶部一行日期标签（「今天 + 当前日期」）作为页面时间锚点。
 * - 指标导航 chips 横向滚动，激活态以 `--valo-prime` 作为强调色。
 * - 时间窗（日 / 周 / 月）以 pill 组形式呈现，全部使用 token 颜色。
 * - 整张卡使用 ValoCard 承载，与页面其他 Valo 表面保持视觉一致。
 *
 * 控制状态与回调全部来自 Zustand store，调用方无需关心。
 *
 * onChange 契约保持不变：仍通过 `useDataCenterStore` 派发 setActiveTab /
 * setTimeframe，URL 与既有查询 hook 不受影响。
 */
const tabKeys: { id: DataTab; labelKey: string }[] = [
  { id: 'overview', labelKey: 'overview' },
  { id: 'sleep', labelKey: 'sleep' },
  { id: 'hrv', labelKey: 'hrv' },
  { id: 'resting-hr', labelKey: 'restingHr' },
  { id: 'activity', labelKey: 'activity' },
  { id: 'spo2', labelKey: 'spo2' },
  { id: 'stress', labelKey: 'stress' },
];

const timeframeKeys: { id: Timeframe; labelKey: string }[] = [
  { id: 'day', labelKey: 'timeframeDay' },
  { id: 'week', labelKey: 'timeframeWeek' },
  { id: 'month', labelKey: 'timeframeMonth' },
];

export function DataCenterControls() {
  const { activeTab, timeframe, setActiveTab, setTimeframe } = useDataCenterStore();
  const t = useTranslations('dataCenter');

  const tabs = tabKeys.map((item) => ({ ...item, label: t(item.labelKey) }));
  const timeframes = timeframeKeys.map((item) => ({ ...item, label: t(item.labelKey) }));

  return (
    <div className="flex flex-col gap-4" data-valo-trends-controls="">
      {/* 顶部日期标签 */}
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-[var(--valo-text-secondary)]">
          {t('dateLabel')}
        </span>
        <time
          dateTime={formatDateISO()}
          className="text-xs text-[var(--valo-text-secondary)] tabular-nums"
        >
          {formatDateDisplay()}
        </time>
      </div>

      {/* 指标导航 chips：横向滚动 */}
      <div
        className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1"
        role="tablist"
        aria-label={t('dataMetric')}
      >
        {tabs.map((item) => {
          const isActive = item.id === activeTab;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(item.id)}
              className={[
                'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
                isActive
                  ? 'border-transparent bg-[var(--valo-prime)] text-[var(--valo-canvas)]'
                  : 'border-[var(--valo-border)] bg-[var(--valo-surface)] text-[var(--valo-text-secondary)] hover:text-[var(--valo-text-primary)]',
              ].join(' ')}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* 时间窗 pill 组 */}
      <div
        className="flex items-center justify-between border-t border-[var(--valo-border)] pt-3"
      >
        <span className="text-xs font-medium text-[var(--valo-text-secondary)]">
          {t('timeWindow')}
        </span>
        <div
          role="tablist"
          aria-label={t('timeWindow')}
          className="flex items-center gap-1 rounded-full border border-[var(--valo-border)] bg-[var(--valo-surface)] p-1"
        >
          {timeframes.map((item) => {
            const isActive = item.id === timeframe;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setTimeframe(item.id)}
                className={[
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-[var(--valo-prime)] text-[var(--valo-canvas)]'
                    : 'text-[var(--valo-text-secondary)] hover:text-[var(--valo-text-primary)]',
                ].join(' ')}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  日期格式化辅助                                               */
/* ────────────────────────────────────────────────────────────── */

function formatDateISO(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateDisplay(): string {
  // 使用 locale 默认格式（与 next-intl 当前 locale 解耦，保证 SSR 一致）
  return new Date().toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
