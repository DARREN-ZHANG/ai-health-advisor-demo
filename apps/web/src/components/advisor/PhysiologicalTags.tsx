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

/**
 * 生理上下文标签条 —— Valo 视觉统一（I5.2）。
 *
 * 设计要点：
 * - 仅引用 `var(--valo-*)` token，不再使用散落的 slate-/blue-/green- 类名。
 * - Profile 标签：prime 强调色（10% 透明度，color-mix）。
 * - 自定义标签 / tab / timeframe / homepage：surface 中性色。
 * - 实时连接标签：active 绿色强调，暗示"AI 在线"。
 * - 稳定测试锚点：
 *   `data-valo-physio-tags`（容器）+ 每个 Pill 上的 `data-valo-physio-tag`。
 * - 行为完全保留：tab/timeframe 映射、Profile lookup、路径检测、翻译。
 */
export function PhysiologicalTags() {
  const pathname = usePathname();
  const { currentProfile, currentProfileId } = useProfileStore();
  const { activeTab, timeframe } = useDataCenterStore();
  const t = useTranslations('dataCenter');
  const tCommon = useTranslations('common');

  const displayName = currentProfile
    ? localize(currentProfile.name, DEFAULT_LOCALE)
    : currentProfileId;
  const tags = currentProfile
    ? currentProfile.tags.slice(0, 2).map((tag) => localize(tag, DEFAULT_LOCALE))
    : [];
  const isDataCenterPage = pathname === '/data-center';

  // 标签样式：用 color-mix 在 srgb 色彩空间内做透明度叠加，
  // 既保留 token 单源真相，又能控制对比度。
  const neutralPillStyle = {
    backgroundColor: 'color-mix(in srgb, var(--valo-surface) 70%, transparent)',
    color: 'var(--valo-text-secondary)',
    border: '1px solid var(--valo-border)',
  } as const;

  const profilePillStyle = {
    backgroundColor: 'color-mix(in srgb, var(--valo-prime) 12%, transparent)',
    color: 'var(--valo-prime)',
    border: '1px solid color-mix(in srgb, var(--valo-prime) 22%, transparent)',
  } as const;

  const connectionPillStyle = {
    backgroundColor: 'color-mix(in srgb, var(--valo-active) 12%, transparent)',
    color: 'var(--valo-active)',
    border: '1px solid color-mix(in srgb, var(--valo-active) 22%, transparent)',
  } as const;

  const pillClassName = 'text-[10px] py-0';

  return (
    <div
      data-valo-physio-tags="true"
      className={
        'flex flex-wrap gap-1.5 px-5 py-2 border-b ' +
        'border-[var(--valo-border)] bg-[var(--valo-surface)]/30'
      }
    >
      <Pill
        data-valo-physio-tag="profile"
        className={pillClassName}
        style={profilePillStyle}
      >
        👤 {displayName}
      </Pill>
      {tags.map((tag) => (
        <Pill
          key={tag}
          data-valo-physio-tag="custom-tag"
          className={pillClassName}
          style={neutralPillStyle}
        >
          {tag}
        </Pill>
      ))}
      {isDataCenterPage ? (
        <>
          <Pill
            data-valo-physio-tag="tab"
            className={pillClassName}
            style={neutralPillStyle}
          >
            📍 {t(TAB_KEY_MAP[activeTab] || activeTab)}
          </Pill>
          <Pill
            data-valo-physio-tag="timeframe"
            className={pillClassName}
            style={neutralPillStyle}
          >
            📅 {t(TIMEFRAME_KEY_MAP[timeframe] || timeframe)}
          </Pill>
        </>
      ) : (
        <Pill
          data-valo-physio-tag="homepage"
          className={pillClassName}
          style={neutralPillStyle}
        >
          🏠 {tCommon('homepageContext')}
        </Pill>
      )}
      <Pill
        data-valo-physio-tag="connection"
        className={pillClassName}
        style={connectionPillStyle}
      >
        ● {tCommon('realTimeConnection')}
      </Pill>
    </div>
  );
}
