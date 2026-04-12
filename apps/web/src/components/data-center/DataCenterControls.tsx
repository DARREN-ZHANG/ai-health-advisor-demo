'use client';

import { Tabs } from '@health-advisor/ui';
import { useDataCenterStore } from '@/stores/data-center.store';
import type { DataTab, Timeframe } from '@health-advisor/shared';

const tabs: { id: DataTab; label: string }[] = [
  { id: 'sleep', label: '睡眠' },
  { id: 'hrv', label: 'HRV' },
  { id: 'resting-hr', label: '静息心率' },
  { id: 'activity', label: '活动' },
  { id: 'spo2', label: '血氧' },
  { id: 'stress', label: '压力负荷' },
];

const timeframes: { id: Timeframe; label: string }[] = [
  { id: 'day', label: '日' },
  { id: 'week', label: '周' },
  { id: 'month', label: '月' },
  { id: 'year', label: '年' },
];

export function DataCenterControls() {
  const { activeTab, timeframe, setActiveTab, setTimeframe } = useDataCenterStore();

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
        <span className="text-sm font-medium text-slate-400">时间窗口</span>
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
