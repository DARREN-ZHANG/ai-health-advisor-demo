'use client';

import { useTranslations } from 'next-intl';

/**
 * BriefTimeline —— Now 区段。
 *
 * 显示实时简报 `summary`。
 *
 * 加载态使用骨架占位；可交互建议统一由首页的 `ActionCard` 渲染，避免
 * 同时出现两类建议卡片。
 */
export interface BriefTimelineProps {
  summary: string;
  isLoading?: boolean;
}

export function BriefTimeline({
  summary,
  isLoading = false,
}: BriefTimelineProps) {
  const t = useTranslations('homepage');

  if (isLoading) {
    return (
      <section aria-busy="true" className="relative pl-8">
        <div className="space-y-3 animate-pulse" aria-hidden="true">
          <div className="h-5 w-20 rounded bg-[var(--valo-border)]" />
          <div className="h-4 w-3/4 rounded bg-[var(--valo-border)]" />
          <div className="h-4 w-2/3 rounded bg-[var(--valo-border)]" />
        </div>
      </section>
    );
  }

  return (
    <section aria-label={t('now')} className="relative pl-8" data-valo-brief-timeline="">
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 flex h-5 w-5 items-center justify-center text-[20px] leading-5 text-[var(--valo-prime)] drop-shadow-[0_0_8px_var(--valo-prime)]"
        data-valo-now-arrow=""
      >
        ➤
      </span>

      <div className="space-y-3">
        <h2
          className="text-sm font-medium leading-5 text-[var(--valo-text-primary)]"
          data-valo-serif="true"
        >
          {t('now')}
        </h2>

        <p className="whitespace-pre-line text-sm leading-5 text-[color-mix(in_srgb,var(--valo-text-primary)_86%,transparent)]">
          {summary}
        </p>
      </div>
    </section>
  );
}
