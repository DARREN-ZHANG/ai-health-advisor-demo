'use client';

import { CHART_TOKEN_META, ChartTokenId, localize } from '@health-advisor/shared';
import type { Locale } from '@health-advisor/shared';
import {
  MicroChart,
  getChartBuilder,
} from '@health-advisor/charts';
import { Card } from '@health-advisor/ui';
import { useChartDataQuery } from '@/hooks/use-data-query';
import { useProfileStore } from '@/stores/profile.store';
import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';

interface ChartTokenRendererProps {
  tokenId: ChartTokenId;
}

type AxisOption = Record<string, unknown> | undefined;

function hideAxis(axis: AxisOption): Record<string, unknown> {
  const base = axis ?? {};
  const axisLabel = (base.axisLabel as Record<string, unknown> | undefined) ?? {};
  const axisLine = (base.axisLine as Record<string, unknown> | undefined) ?? {};
  const axisTick = (base.axisTick as Record<string, unknown> | undefined) ?? {};
  const splitLine = (base.splitLine as Record<string, unknown> | undefined) ?? {};

  return {
    ...base,
    show: false,
    name: undefined,
    axisLabel: { ...axisLabel, show: false },
    axisLine: { ...axisLine, show: false },
    axisTick: { ...axisTick, show: false },
    splitLine: { ...splitLine, show: false },
  };
}

/**
 * 单个 chart token 渲染器 —— Valo 视觉统一（I5.2）。
 *
 * 仅做"颜色字面量"层面的最小修复：把旧的 slate-/blue- 类名替换为
 * `var(--valo-*)` token；不改动内部图表 option 构造逻辑。
 */
export function ChartTokenRenderer({ tokenId }: ChartTokenRendererProps) {
  const { currentProfileId } = useProfileStore();
  const { data, isLoading } = useChartDataQuery(currentProfileId, [tokenId]);
  const tokenMeta = CHART_TOKEN_META[tokenId];
  const t = useTranslations('common');
  const locale = useLocale() as Locale;

  const option = useMemo(() => {
    if (!data) return null;
    const builder = getChartBuilder(tokenId);
    if (!builder) return null;

    // 把当前 locale 的 label/unit 显式传给 builder，避免回退到默认 locale
    const fullOption = tokenMeta
      ? builder(data, {
          label: localize(tokenMeta.label, locale),
          unit: localize(tokenMeta.unit, locale),
        })
      : builder(data);

    return {
      ...fullOption,
      animation: false,
      title: undefined,
      legend: undefined,
      grid: { top: 6, right: 6, bottom: 6, left: 6, containLabel: false },
      xAxis: Array.isArray(fullOption.xAxis)
        ? fullOption.xAxis.map((axis) => hideAxis(axis as AxisOption))
        : hideAxis(fullOption.xAxis as AxisOption),
      yAxis: Array.isArray(fullOption.yAxis)
        ? fullOption.yAxis.map((axis) => hideAxis(axis as AxisOption))
        : hideAxis(fullOption.yAxis as AxisOption),
    };
  }, [data, tokenId, tokenMeta, locale]);

  return (
    <Card
      className={
        'p-4 flex flex-col gap-3 w-full border ' +
        'border-[var(--valo-border)] bg-[var(--valo-surface)] text-[var(--valo-text-primary)]'
      }
    >
      <div className="flex justify-between items-center">
        <span
          className={
            'text-xs font-bold uppercase tracking-widest pl-2 ' +
            'text-[var(--valo-text-secondary)] border-l-2 border-[var(--valo-border)]'
          }
        >
          {tokenMeta ? localize(tokenMeta.label, locale) : tokenId}
        </span>
        <button
          className={
            'text-[10px] font-bold px-2 py-1 rounded transition-colors ' +
            'text-[var(--valo-prime)] hover:opacity-80 ' +
            'bg-[color-mix(in_srgb,var(--valo-prime)_8%,transparent)]'
          }
        >
          {t('viewDetail')}
        </button>
      </div>
      <div
        className={
          'h-32 w-full rounded-lg flex items-center justify-center overflow-hidden ' +
          'bg-[var(--valo-canvas)]/40 border border-[var(--valo-border)]/50'
        }
      >
        {isLoading ? (
          <div className="w-full h-full bg-[var(--valo-surface)]/50 animate-pulse flex items-center justify-center">
            <div className="flex gap-1">
              <div className="w-1 h-1 rounded-full bg-[var(--valo-text-secondary)] animate-bounce" />
              <div className="w-1 h-1 rounded-full bg-[var(--valo-text-secondary)] animate-bounce [animation-delay:0.2s]" />
              <div className="w-1 h-1 rounded-full bg-[var(--valo-text-secondary)] animate-bounce [animation-delay:0.4s]" />
            </div>
          </div>
        ) : option ? (
          <MicroChart option={option} height={110} />
        ) : (
          <span className="text-xs font-medium text-[var(--valo-text-secondary)]">
            {!getChartBuilder(tokenId) ? t('noRenderer') : t('noDataShort')}
          </span>
        )}
      </div>
    </Card>
  );
}
