'use client';

import { useTranslations } from 'next-intl';
import { ValoCard } from '@/components/valo/ValoCard';
import type { HomeTrendCardDisplay } from '@health-advisor/shared';
import {
  HOME_TREND_CARD_MOCK_ACTIVITY,
  HOME_TREND_CARD_MOCK_SLEEP,
} from './home-trend-card.mock';

/**
 * HomeTrendCard —— 首页 Trends Brief 的纯展示组件。
 *
 * 视觉合同（来自实施文档）：
 * - 根节点 ValoCard as="section"，h-48（192px），overflow-hidden。
 * - `data-valo-home-trend-card={display}` 作为 E2E 与单测的稳定锚点。
 * - 颜色仅使用 `var(--valo-*)`，不写散落 hex / slate / blue。
 * - 标题为 Sleep 或 Activity，副标为本地化的"7 日简报"。
 * - Sleep 主数值 7h 42m，展示 Score / Deep Sleep / Efficiency。
 * - Activity 主数值 8,426，展示 Distance / Calories / Active Minutes。
 * - 内联 SVG 为语义无关装饰，aria-hidden=true。
 *
 * 不接受 onClick / href，本组件无任何交互。
 */
export interface HomeTrendCardProps {
  display: Exclude<HomeTrendCardDisplay, 'hidden'>;
}

export function HomeTrendCard({ display }: HomeTrendCardProps) {
  const t = useTranslations('homepage.trendBrief');

  return (
    <ValoCard
      as="section"
      aria-label={display === 'sleep' ? t('sleepTitle') : t('activityTitle')}
      className="h-48 overflow-hidden"
      data-valo-home-trend-card={display}
    >
      {display === 'sleep' ? (
        <SleepContent mock={HOME_TREND_CARD_MOCK_SLEEP} />
      ) : (
        <ActivityContent mock={HOME_TREND_CARD_MOCK_ACTIVITY} />
      )}
    </ValoCard>
  );
}

function SleepContent({ mock }: { mock: typeof HOME_TREND_CARD_MOCK_SLEEP }) {
  const t = useTranslations('homepage.trendBrief');
  const points = normalizeTrend(mock.trend);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-baseline justify-between gap-3">
        <h3
          className="text-sm font-semibold text-[var(--valo-text-primary)]"
          data-valo-serif="true"
        >
          {t('sleepTitle')}
        </h3>
        <span className="text-[10px] uppercase tracking-wide text-[color-mix(in_srgb,var(--valo-text-primary)_60%,transparent)]">
          {t('period')}
        </span>
      </header>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold leading-6 text-[var(--valo-text-primary)]">
            {mock.primaryValue}
          </div>
          <div className="mt-1 text-xs text-[color-mix(in_srgb,var(--valo-text-primary)_72%,transparent)]">
            {t('sleepDuration')}
          </div>
        </div>
        <TrendSparkline points={points} />
      </div>

      <dl className="mt-auto grid grid-cols-3 gap-2 text-xs text-[color-mix(in_srgb,var(--valo-text-primary)_78%,transparent)]">
        <Metric label={t('score')} value={`${mock.score}`} />
        <Metric label={t('deepSleep')} value={mock.deepSleep} />
        <Metric label={t('efficiency')} value={mock.efficiency} />
      </dl>
    </div>
  );
}

function ActivityContent({ mock }: { mock: typeof HOME_TREND_CARD_MOCK_ACTIVITY }) {
  const t = useTranslations('homepage.trendBrief');
  const points = normalizeTrend(mock.trend);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-baseline justify-between gap-3">
        <h3
          className="text-sm font-semibold text-[var(--valo-text-primary)]"
          data-valo-serif="true"
        >
          {t('activityTitle')}
        </h3>
        <span className="text-[10px] uppercase tracking-wide text-[color-mix(in_srgb,var(--valo-text-primary)_60%,transparent)]">
          {t('period')}
        </span>
      </header>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold leading-6 text-[var(--valo-text-primary)]">
            {mock.primaryValue}
          </div>
          <div className="mt-1 text-xs text-[color-mix(in_srgb,var(--valo-text-primary)_72%,transparent)]">
            {t('steps')}
          </div>
        </div>
        <TrendSparkline points={points} />
      </div>

      <dl className="mt-auto grid grid-cols-3 gap-2 text-xs text-[color-mix(in_srgb,var(--valo-text-primary)_78%,transparent)]">
        <Metric label={t('distance')} value={mock.distance} />
        <Metric label={t('calories')} value={mock.calories} />
        <Metric label={t('activeMinutes')} value={mock.activeMinutes} />
      </dl>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-[color-mix(in_srgb,var(--valo-text-primary)_55%,transparent)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-[var(--valo-text-primary)]">{value}</dd>
    </div>
  );
}

/**
 * 装饰性折线 SVG。
 * points 来自归一化后的 SVG 坐标（viewBox 100x32），调用方无需关心映射细节。
 */
function TrendSparkline({ points }: { points: ReadonlyArray<{ x: number; y: number }> }) {
  const polylinePoints = points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      className="h-8 w-24 text-[var(--valo-prime)]"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={polylinePoints}
      />
    </svg>
  );
}

/**
 * 把 7 个数值归一化到 viewBox 100x32 的 SVG 坐标。
 *
 * - 最大值映射到 y=4（顶部留 4px 空白）
 * - 最小值映射到 y=28（底部留 4px 空白）
 * - 最大值等于最小值时全部映射到中线 y=16，避免除零
 * - x 等距分布到 [0, 100]
 */
export function normalizeTrend(values: ReadonlyArray<number>): Array<{ x: number; y: number }> {
  const count = values.length;
  if (count === 0) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  const stepX = count > 1 ? 100 / (count - 1) : 0;
  const top = 4;
  const bottom = 28;
  const span = bottom - top;

  return values.map((value, index) => {
    const x = index * stepX;
    const y =
      range === 0
        ? 16
        : bottom - ((value - min) / range) * span;
    return { x, y };
  });
}
