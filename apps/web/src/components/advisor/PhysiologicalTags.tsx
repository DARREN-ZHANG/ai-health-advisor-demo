'use client';

import { Pill } from '@health-advisor/ui';
import { localize, DEFAULT_LOCALE } from '@health-advisor/shared';
import { usePathname } from 'next/navigation';
import { useProfileStore } from '@/stores/profile.store';
import { useDataCenterStore } from '@/stores/data-center.store';
import { useTranslations } from 'next-intl';

/** data-center tab 到翻译键的映射 */
const TAB_KEY_MAP: Record<string, string> = {
  sleep: 'physTagSleep',
  hrv: 'physTagHrv',
  'resting-hr': 'physTagRestingHr',
  activity: 'physTagActivity',
  spo2: 'physTagSpo2',
  stress: 'physTagStress',
};

const TIMEFRAME_KEY_MAP: Record<string, string> = {
  day: 'physTagDay',
  week: 'physTagWeek',
  month: 'physTagMonth',
  year: 'physTagYear',
};

export function PhysiologicalTags() {
  const pathname = usePathname();
  const { currentProfile, currentProfileId } = useProfileStore();
  const { activeTab, timeframe } = useDataCenterStore();
  const t = useTranslations('dataCenter');
  const tCommon = useTranslations('common');

  const displayName = currentProfile ? localize(currentProfile.name, DEFAULT_LOCALE) : currentProfileId;
  const tags = currentProfile
    ? currentProfile.tags.slice(0, 2).map((tag) => localize(tag, DEFAULT_LOCALE))
    : [];
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
            📍 {t(TAB_KEY_MAP[activeTab] || activeTab)}
          </Pill>
          <Pill className="bg-slate-800 text-slate-400 border border-slate-700 text-[10px] py-0">
            📅 {t(TIMEFRAME_KEY_MAP[timeframe] || timeframe)}
          </Pill>
        </>
      ) : (
        <Pill className="bg-slate-800 text-slate-400 border border-slate-700 text-[10px] py-0">
          🏠 {tCommon('homepageContext')}
        </Pill>
      )}
      <Pill className="bg-green-500/10 text-green-400 border border-green-500/20 text-[10px] py-0">
        ● {tCommon('realTimeConnection')}
      </Pill>
    </div>
  );
}
