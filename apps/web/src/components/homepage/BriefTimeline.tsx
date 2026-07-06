'use client';

import { useTranslations } from 'next-intl';
import { ValoCard } from '@/components/valo/ValoCard';

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
      <ValoCard aria-busy="true">
        <div className="space-y-3 animate-pulse" aria-hidden="true">
          <div className="h-5 w-20 rounded bg-[var(--valo-border)]" />
          <div className="h-4 w-3/4 rounded bg-[var(--valo-border)]" />
          <div className="h-4 w-2/3 rounded bg-[var(--valo-border)]" />
        </div>
      </ValoCard>
    );
  }

  const tips = microTips ?? [];

  return (
    <ValoCard as="section" aria-label={t('now')}>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block w-1.5 h-4 rounded-full bg-[var(--valo-prime)]"
          />
          <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--valo-text-secondary)]">
            {t('now')}
          </h2>
        </div>

        <p className="text-base leading-relaxed text-[var(--valo-text-primary)] whitespace-pre-line">
          {summary}
        </p>

        {tips.length > 0 ? (
          <div className="space-y-2 pt-2 border-t border-[var(--valo-border)]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--valo-text-secondary)]">
              {t('microTipsTitle')}
            </h3>
            <ul className="space-y-1.5">
              {tips.map((tip, idx) => (
                <li
                  key={`${idx}-${tip.slice(0, 12)}`}
                  className="flex items-start gap-2 text-sm text-[var(--valo-text-secondary)]"
                >
                  <span
                    aria-hidden="true"
                    className="mt-1.5 inline-block w-1 h-1 rounded-full bg-[var(--valo-text-secondary)] shrink-0"
                  />
                  <span className="min-w-0">{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </ValoCard>
  );
}
