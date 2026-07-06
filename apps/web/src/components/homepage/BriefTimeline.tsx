'use client';

import { useTranslations } from 'next-intl';

/**
 * BriefTimeline —— Now 区段。
 *
 * 显示实时简报 `summary` 与 `microTips`。
 *
 * 关键约束（来自 I3.2 任务卡）：
 * - `microTips` 仅作非交互静态提示，不渲染任何按钮或 onClick；
 *   不推断为可交互行动。
 * - 加载态使用骨架占位。
 */
export interface BriefTimelineProps {
  summary: string;
  microTips?: ReadonlyArray<string>;
  isLoading?: boolean;
}

export function BriefTimeline({
  summary,
  microTips,
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

  const tips = microTips ?? [];

  return (
    <section aria-label={t('now')} className="relative pl-8" data-valo-brief-timeline="">
      <span
        aria-hidden="true"
        className="absolute left-[7px] top-5 h-[calc(100%+28px)] w-px bg-[color-mix(in_srgb,var(--valo-prime)_55%,transparent)]"
      />
      <span
        aria-hidden="true"
        className="absolute left-0 top-1 text-[26px] leading-none text-[var(--valo-prime)] drop-shadow-[0_0_8px_var(--valo-prime)]"
      >
        ➤
      </span>

      <div className="space-y-4">
        <h2
          className="text-[22px] leading-none text-[var(--valo-text-primary)]"
          data-valo-serif="true"
        >
          {t('now')}
        </h2>

        <p className="whitespace-pre-line text-[17px] leading-7 text-[color-mix(in_srgb,var(--valo-text-primary)_86%,transparent)]">
          {summary}
        </p>

        {tips.length > 0 ? (
          <div className="space-y-2">
            <h3 className="sr-only">
              {t('microTipsTitle')}
            </h3>
            <ul className="grid gap-3 sm:grid-cols-2">
              {tips.map((tip, idx) => (
                <li
                  key={`${idx}-${tip.slice(0, 12)}`}
                  className="rounded-lg bg-[color-mix(in_srgb,var(--valo-surface)_86%,black)] p-4 text-sm leading-relaxed text-[color-mix(in_srgb,var(--valo-text-primary)_82%,transparent)] shadow-[var(--valo-shadow-card)]"
                >
                  <span
                    aria-hidden="true"
                    className="mb-2 block text-lg leading-none text-[var(--valo-prime)]"
                  >
                    ✦
                  </span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
