'use client';

import { Pill } from '@health-advisor/ui';
import { usePathname } from 'next/navigation';
import { useProfileStore } from '@/stores/profile.store';
import { useDataCenterStore } from '@/stores/data-center.store';

export function PhysiologicalTags() {
  const pathname = usePathname();
  const { currentProfile, currentProfileId } = useProfileStore();
  const { activeTab, timeframe } = useDataCenterStore();

  const labels: Record<string, string> = {
    sleep: '睡眠',
    hrv: 'HRV',
    'resting-hr': '心率',
    activity: '活动',
    spo2: '血氧',
    stress: '压力',
    day: '今日',
    week: '本周',
    month: '本月',
    year: '今年',
  };

  const displayName = currentProfile?.name ?? currentProfileId;
  const tags = currentProfile?.tags.slice(0, 2) ?? [];
  const isDataCenterPage = pathname === '/data-center';

  return (
    <div className="flex flex-wrap gap-1.5 px-5 py-2 border-b border-slate-800 bg-slate-900/30">
      <Pill className="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] py-0">
        👤 {displayName}
      </Pill>
      {tags.map((tag) => (
        <Pill
          key={tag}
          className="bg-slate-800 text-slate-300 border border-slate-700 text-[10px] py-0"
        >
          {tag}
        </Pill>
      ))}
      {isDataCenterPage ? (
        <>
          <Pill className="bg-slate-800 text-slate-400 border border-slate-700 text-[10px] py-0">
            📍 {labels[activeTab]}
          </Pill>
          <Pill className="bg-slate-800 text-slate-400 border border-slate-700 text-[10px] py-0">
            📅 {labels[timeframe]}
          </Pill>
        </>
      ) : (
        <Pill className="bg-slate-800 text-slate-400 border border-slate-700 text-[10px] py-0">
          🏠 首页上下文
        </Pill>
      )}
      <Pill className="bg-green-500/10 text-green-400 border border-green-500/20 text-[10px] py-0">
        ● 实时连接
      </Pill>
    </div>
  );
}
