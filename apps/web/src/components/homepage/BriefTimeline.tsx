'use client';

import { useTranslations } from 'next-intl';
import {
  HERO_LOADING_ROTATION_DURATION_SECONDS,
  HERO_RING_STOPS,
} from './hero-ring';

/**
 * BriefTimeline —— Now 区段。
 *
 * 显示实时简报 `summary`。
 *
 * 首次加载使用骨架占位；已有内容刷新时保留简报，并在标题右侧显示更新状态。
 * 可交互建议统一由首页的 `ActionCard` 渲染，避免同时出现两类建议卡片。
 */
export interface BriefTimelineProps {
  summary: string;
  currentTime?: string;
  isLoading?: boolean;
  isUpdating?: boolean;
}

export function BriefTimeline({
  summary,
  currentTime,
  isLoading = false,
  isUpdating = false,
}: BriefTimelineProps) {
  const t = useTranslations('homepage');
  const formattedTime = formatTimelineTime(currentTime);

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
        <div className="flex min-h-5 items-center justify-between gap-3">
          <h2
            className="text-sm font-medium leading-5 text-[var(--valo-text-primary)]"
            data-valo-serif="true"
          >
            {t('now')}
            {formattedTime ? ` - ${formattedTime}` : ''}
          </h2>

          {isUpdating ? (
            <span
              role="status"
              aria-live="polite"
              className="inline-flex shrink-0 items-center gap-1.5 text-sm leading-5 text-[color-mix(in_srgb,var(--valo-text-primary)_86%,transparent)]"
              data-valo-brief-updating="true"
            >
              <span
                aria-hidden="true"
                className="h-4 w-4 shrink-0 animate-spin rounded-full drop-shadow-[0_0_5px_var(--valo-prime)]"
                data-valo-brief-updating-ring="true"
                style={{
                  backgroundImage: `conic-gradient(${[
                    ...HERO_RING_STOPS['prime-readiness'],
                    HERO_RING_STOPS['prime-readiness'][0],
                  ].join(', ')})`,
                  animationDuration: `${HERO_LOADING_ROTATION_DURATION_SECONDS}s`,
                  WebkitMaskImage:
                    'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 0)',
                  maskImage:
                    'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 0)',
                }}
              />
              {t('updating')}
            </span>
          ) : null}
        </div>

        <p className="whitespace-pre-line text-sm leading-5 text-[color-mix(in_srgb,var(--valo-text-primary)_86%,transparent)]">
          {summary}
        </p>
      </div>
    </section>
  );
}

function formatTimelineTime(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(/(?:T|^)(\d{2}):(\d{2})$/);
  if (!match) return undefined;
  const hour = Number(match[1]);
  if (hour > 23) return undefined;
  return `${match[1]}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
}
