'use client';

import { Tabs } from '@health-advisor/ui';
import { useDataCenterStore } from '@/stores/data-center.store';
import { useTranslations } from 'next-intl';
import type { DataTab, Timeframe } from '@health-advisor/shared';

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
    <div className="flex flex-col gap-4">
      {/* 顶部主选项卡 */}
      <div className="overflow-x-auto no-scrollbar pb-1">
        <Tabs
          items={tabs}
          activeId={activeTab}
          onSelect={(id) => setActiveTab(id as DataTab)}
        />
      </div>

      {/* 时间窗切换 */}
      <div className="flex items-center justify-between border-t border-slate-800 pt-4">
        <span className="text-sm font-medium text-slate-400">{t('timeWindow')}</span>
        <Tabs
          items={timeframes}
          activeId={timeframe}
          onSelect={(id) => setTimeframe(id as Timeframe)}
          className="bg-slate-900 p-1 rounded-lg border border-slate-800"
        />
      </div>
    </div>
  );
}
