'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useViewSummary } from '@/hooks/use-ai-query';
import type { DataTab } from '@health-advisor/shared';

/**
 * ReflectionSection —— Trends 页面洞察文本段。
 */
export interface ReflectionSectionProps {
  /** 当前 profile id；为 undefined 时 hook 会被禁用 */
  profileId: string | undefined;
  /** 页面上下文：data-center 页面 + 当前 tab + timeframe */
  pageContext: {
    page: 'data-center';
    tab: DataTab;
    timeframe: string;
  };
  /** 可选的布局 className */
  className?: string;
}

export function ReflectionSection({
  profileId,
  pageContext,
  className = '',
}: ReflectionSectionProps) {
  const t = useTranslations('dataCenter');
  const locale = useLocale();
  const { tab, timeframe } = pageContext;

  // hook 始终被调用（Rules of Hooks）；profileId 为空时内部 enabled=false，
  // 不会触发请求，但会让组件保持稳定的 hook 调用顺序。
  const {
    data: summaryData,
    isLoading,
    isFetching,
    isError,
  } = useViewSummary(profileId, tab, timeframe);

  const isBusy = isLoading || isFetching;
  const summary = summaryData?.summary?.trim();
  const microTips = summaryData?.microTips ?? [];
  const hasSummary = !!summary;

  // 将多条建议按当前 locale 自然连接为一句（中文「A、B和C」，英文「A, B, and C」），
  // 形成与「分析」段并立的「建议」段，避免再以列表形式罗列。
  const tipsText =
    microTips.length > 0
      ? new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(
          microTips,
        )
      : '';

  return (
    <section
      aria-busy={isBusy || undefined}
      aria-label={t('reflection.title')}
      data-valo-trends-reflection=""
      className={`px-5 pt-[21px] pb-[26px] ${className}`.trim()}
    >
      <h2 className="mb-[14px] font-serif text-[18px] font-normal leading-[22px] text-white">
        {t('reflection.title')}
      </h2>

      {isBusy ? (
        <ReflectionSkeleton />
      ) : isError || !hasSummary ? (
        <p className="text-[13px] leading-[19px] text-white/75">
          {t('reflection.empty')}
        </p>
      ) : (
        <ReflectionContent summary={summary!} tipsText={tipsText} />
      )}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  子组件                                                       */
/* ────────────────────────────────────────────────────────────── */

function ReflectionSkeleton() {
  return (
    <div className="space-y-[9px] animate-pulse" aria-hidden="true">
      <div className="h-[13px] w-3/4 rounded bg-white/10" />
      <div className="h-[13px] w-full rounded bg-white/10" />
      <div className="h-[13px] w-5/6 rounded bg-white/10" />
    </div>
  );
}

function ReflectionContent({
  summary,
  tipsText,
}: {
  summary: string;
  tipsText: string;
}) {
  return (
    <div className="space-y-[12px]">
      <p className="whitespace-pre-wrap text-[13px] font-normal leading-[19px] text-white/78">
        {summary}
      </p>

      {tipsText && (
        <p className="whitespace-pre-wrap text-[13px] font-normal leading-[19px] text-white/78">
          {tipsText}
        </p>
      )}
    </div>
  );
}
