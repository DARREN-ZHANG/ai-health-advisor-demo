'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckIcon } from '@heroicons/react/24/outline';
import type { ActionOption, FutureSuggestion } from '@health-advisor/shared';

/**
 * FutureTimelineBlock —— 未来时间点建议（Valo 时间轴风格）。
 *
 * 视觉基于 StaticTimelineBlock（左侧 timeline 圆点 + 标题 + body），
 * 加上 predictedState 显示和 Yes/Not Now 按钮（复用 ActionCard 的交互模式）。
 *
 * 行为契约：
 * - 任一按钮点击后，卡片收起为一行摘要（保留可访问性）。
 * - `pending=true` 时禁用按钮，Yes 按钮显示 spinner。
 * - 仅引用 `--valo-*` token；不出现硬编码颜色。
 *
 * 与 ActionCard 的区别：
 * - ActionCard 是"当下即时行动"，FutureTimelineBlock 是"未来某时间点的预防性行动"
 * - FutureTimelineBlock 多了 timePoint / predictedState / rationale 三个解释型字段
 */
export interface FutureTimelineBlockProps {
  suggestion: FutureSuggestion;
  onYes: (action: ActionOption) => void;
  onNotNow: (action: ActionOption) => void;
  /** 当前是否正在 pending（loading） */
  pending?: boolean;
}

export function FutureTimelineBlock({
  suggestion,
  onYes,
  onNotNow,
  pending = false,
}: FutureTimelineBlockProps) {
  const t = useTranslations('homepage.action');
  const [collapsed, setCollapsed] = useState(false);
  const [outcome, setOutcome] = useState<'recorded' | 'dismissed' | null>(null);

  const { timePoint, predictedState, rationale, action } = suggestion;

  function handleYes() {
    if (pending) return;
    setCollapsed(true);
    setOutcome('recorded');
    onYes(action);
  }

  function handleNotNow() {
    if (pending) return;
    setCollapsed(true);
    setOutcome('dismissed');
    onNotNow(action);
  }

  if (collapsed) {
    return (
      <section className="relative pl-8" data-valo-future-tip="">
        <span
          aria-hidden="true"
          className="absolute left-0 top-1 h-4 w-4 rounded-full bg-[var(--valo-prime)] shadow-[0_0_10px_var(--valo-prime)]"
        />
        <p
          className="text-sm text-[var(--valo-text-secondary)] truncate"
          aria-live="polite"
        >
          <span className="font-medium text-[var(--valo-text-primary)]">
            {timePoint} · {action.title}
          </span>
          {' — '}
          {outcome === 'recorded' ? t('recorded') : t('dismissed')}
        </p>
      </section>
    );
  }

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
        {timePoint} · {action.emoji} {action.title}
      </h2>

      <p className="mt-3 text-sm leading-5 text-[color-mix(in_srgb,var(--valo-text-primary)_82%,transparent)]">
        {predictedState}
      </p>

      <p className="mt-2 text-xs leading-4 italic text-[color-mix(in_srgb,var(--valo-text-primary)_60%,transparent)]">
        依据：{rationale}
      </p>

      {action.description ? (
        <p className="mt-2 text-sm leading-5 text-[color-mix(in_srgb,var(--valo-text-primary)_82%,transparent)]">
          {action.description}
        </p>
      ) : null}

      <div className="mt-4 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={handleNotNow}
          disabled={pending}
          className="rounded-full px-2 py-2 text-xs font-medium leading-4
                     text-[var(--valo-text-secondary)]
                     hover:text-[var(--valo-text-primary)] transition-colors
                     focus-visible:outline-none focus-visible:[box-shadow:var(--valo-focus-ring)]
                     disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {t('notNow')}
        </button>
        <button
          type="button"
          onClick={handleYes}
          disabled={pending}
          aria-busy={pending}
          className="inline-flex h-8 items-center gap-1 rounded-md bg-[var(--valo-text-primary)] px-2.5 text-xs font-semibold leading-4
                     text-[var(--valo-canvas)]
                     hover:opacity-90 transition-opacity
                     focus-visible:outline-none focus-visible:[box-shadow:var(--valo-focus-ring)]
                     disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pending ? (
            <span
              aria-hidden="true"
              className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin"
            />
          ) : (
            <CheckIcon aria-hidden="true" className="h-3.5 w-3.5" />
          )}
          {t('yes')}
        </button>
      </div>
    </section>
  );
}
