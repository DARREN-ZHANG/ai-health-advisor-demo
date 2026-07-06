'use client';

import { SparklesIcon } from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import { ValoCard } from '@/components/valo/ValoCard';
import { useViewSummary } from '@/hooks/use-ai-query';
import type { DataTab } from '@health-advisor/shared';

/**
 * ReflectionSection —— Trends 页面 AI 洞察卡片。
 *
 * 设计意图（来自 design-manifest.md）：
 * - 位于「指标导航」与「趋势卡片」之间，作为页面的认知锚点。
 * - 使用 ValoCard 承载，左侧以 `--valo-prime` 渐变条标识 AI 来源。
 * - 仅引用 CSS 变量，不出现散落的硬编码颜色字面量。
 *
 * 自身负责调用 `useViewSummary`，调用方只需传递 profileId 与 pageContext。
 *
 * 渲染状态：
 * - loading：骨架占位 + aria-busy。
 * - error / empty（无 summary 文本）：渲染低调的「暂无洞察」占位，
 *   保持页面骨架稳定，不让 Reflection 区在加载失败时塌陷消失。
 * - loaded：summary 文本 + 可选 microTips 列表。
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

  return (
    <ValoCard
      as="section"
      aria-busy={isBusy || undefined}
      aria-label={t('reflection.title')}
      data-valo-trends-reflection=""
      className={`relative overflow-hidden ${className}`.trim()}
    >
      {/* 左侧 AI 标记条：以 --valo-prime 为锚 */}
      <span
        aria-hidden="true"
        className="absolute left-0 top-4 bottom-4 w-0.5 rounded-full bg-[var(--valo-prime)]"
      />

      <header className="flex items-center gap-2 pl-3 mb-3">
        <SparklesIcon className="w-4 h-4 text-[var(--valo-prime)]" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-[var(--valo-text-primary)]">
          {t('reflection.title')}
        </h2>
      </header>

      <div className="pl-3">
        {isBusy ? (
          <ReflectionSkeleton />
        ) : isError || !hasSummary ? (
          <p className="text-sm text-[var(--valo-text-secondary)]">
            {t('reflection.empty')}
          </p>
        ) : (
          <ReflectionContent summary={summary!} microTips={microTips} tipsTitle={t('reflection.tipsTitle')} />
        )}
      </div>
    </ValoCard>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  子组件                                                       */
/* ────────────────────────────────────────────────────────────── */

function ReflectionSkeleton() {
  return (
    <div className="space-y-2 animate-pulse" aria-hidden="true">
      <div className="h-3 rounded bg-[var(--valo-border)] w-3/4" />
      <div className="h-3 rounded bg-[var(--valo-border)] w-full" />
      <div className="h-3 rounded bg-[var(--valo-border)] w-5/6" />
    </div>
  );
}

function ReflectionContent({
  summary,
  microTips,
  tipsTitle,
}: {
  summary: string;
  microTips: string[];
  tipsTitle: string;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-[var(--valo-text-primary)] whitespace-pre-wrap">
        {summary}
      </p>

      {microTips.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-1.5">
            <SparklesIcon className="w-3.5 h-3.5 text-[var(--valo-prime)]" aria-hidden="true" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--valo-text-secondary)]">
              {tipsTitle}
            </span>
          </div>
          <ul className="grid grid-cols-1 gap-2 list-none p-0 m-0">
            {microTips.map((tip, idx) => (
              <li
                key={idx}
                className="rounded-lg border border-[var(--valo-border)] bg-[var(--valo-surface)] px-3 py-2 text-xs text-[var(--valo-text-primary)]"
              >
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
