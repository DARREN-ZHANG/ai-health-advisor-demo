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

        {tips.length > 0 ? (
          <div className="space-y-2">
            <h3 className="sr-only">
              {t('microTipsTitle')}
            </h3>
            <ul
              className="flex gap-3 overflow-x-auto overscroll-x-contain pb-1 pr-8 [-ms-overflow-style:none] [scrollbar-width:none] sm:grid sm:grid-cols-2 sm:overflow-visible sm:pr-0 [&::-webkit-scrollbar]:hidden"
              data-valo-micro-tips=""
            >
              {tips.map((tip, idx) => (
                <li
                  key={`${idx}-${tip.slice(0, 12)}`}
                  className="shrink-0 rounded-lg bg-[color-mix(in_srgb,var(--valo-surface)_86%,black)] p-4 text-sm leading-5 text-[color-mix(in_srgb,var(--valo-text-primary)_82%,transparent)] shadow-[var(--valo-shadow-card)] sm:w-auto sm:shrink"
                  data-valo-micro-tip-card=""
                  style={{ flexBasis: 'calc((100% - 12px) / 1.8)' }}
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
