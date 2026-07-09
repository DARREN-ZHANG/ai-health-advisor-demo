import { useTranslations } from 'next-intl';
import type { FutureSuggestion } from '@health-advisor/shared';

/**
 * FutureTimelineBlock —— 未来时间点建议（Valo 时间轴风格）。
 *
 * 预测状态、推断依据和建议合并为一个自然段；未来预测仅作信息展示，
 * 不提供确认或稍后处理的 Action。
 */
export interface FutureTimelineBlockProps {
  suggestion: FutureSuggestion;
}

export function FutureTimelineBlock({ suggestion }: FutureTimelineBlockProps) {
  const t = useTranslations('homepage');
  const { timePoint, predictedState, rationale, action } = suggestion;
  const hour = Number(timePoint.split(':')[0]);
  const period = hour >= 12 ? 'PM' : 'AM';
  const daypart = hour >= 18 ? t('night.title') : t('afternoon.title');

  return (
    <section className="relative pl-8" data-valo-future-tip="">
      <span
        aria-hidden="true"
        className="absolute left-0 top-1 h-4 w-4 rounded-full bg-[var(--valo-prime)] shadow-[0_0_10px_var(--valo-prime)]"
      />
      <h2
        className="text-sm font-medium leading-5 text-[var(--valo-text-primary)]"
        data-valo-serif="true"
      >
        {daypart} - {timePoint} {period}
      </h2>

      <p className="mt-3 text-sm leading-5 text-[color-mix(in_srgb,var(--valo-text-primary)_82%,transparent)]">
        {t('predictionBody', {
          predictedState,
          rationale,
          actionTitle: action.title,
          actionDescription: action.description,
        })}
      </p>
    </section>
  );
}
