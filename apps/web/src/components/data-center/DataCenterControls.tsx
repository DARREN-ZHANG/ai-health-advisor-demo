'use client';

import { useDataCenterStore } from '@/stores/data-center.store';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import type { DataTab } from '@health-advisor/shared';

/**
 * DataCenterControls —— Trends 页面顶部日期分页和维度切换。
 */
const tabKeys: { id: DataTab; labelKey: string; enabled: boolean }[] = [
  { id: 'sleep', labelKey: 'sleep', enabled: true },
  { id: 'activity', labelKey: 'activity', enabled: true },
  { id: 'hrv', labelKey: 'hrv', enabled: false },
  { id: 'resting-hr', labelKey: 'restingHr', enabled: false },
  { id: 'stress', labelKey: 'stress', enabled: false },
  { id: 'spo2', labelKey: 'spo2', enabled: false },
];

export function DataCenterControls() {
  const { activeTab, setActiveTab } = useDataCenterStore();
  const t = useTranslations('dataCenter');

  const tabs = tabKeys.map((item) => ({ ...item, label: t(item.labelKey) }));

  return (
    <div className="flex flex-col" data-valo-trends-controls="">
      <nav
        aria-label={t('datePagination')}
        className="grid h-[58px] grid-cols-[44px_1fr_44px] items-center px-3"
      >
        <button
          type="button"
          aria-label={t('previousDate')}
          className="flex size-11 items-center justify-center text-white/80"
        >
          <ChevronLeftIcon className="size-4" aria-hidden="true" />
        </button>
        <time
          dateTime={formatDateISO()}
          className="text-center text-[13px] font-semibold leading-[18px] text-white"
        >
          {t('today')}
        </time>
        <button
          type="button"
          aria-label={t('nextDate')}
          className="flex size-11 items-center justify-center text-white/35"
        >
          <ChevronRightIcon className="size-4" aria-hidden="true" />
        </button>
      </nav>

      <div className="relative -mx-4">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-[var(--valo-canvas)] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-[var(--valo-canvas)] to-transparent" />
        <div
          className="flex h-[46px] items-center gap-[18px] overflow-x-auto px-4 no-scrollbar"
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
                aria-disabled={!item.enabled}
                disabled={!item.enabled}
                onClick={() => {
                  if (item.enabled) setActiveTab(item.id);
                }}
                className={[
                  'shrink-0 text-[13px] font-semibold leading-[18px] transition-colors',
                  item.enabled
                    ? isActive
                      ? 'text-white'
                      : 'text-white/20 hover:text-white/55'
                    : 'cursor-not-allowed text-white/14',
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
