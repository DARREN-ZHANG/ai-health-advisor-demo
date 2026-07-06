'use client';

import { useTranslations, useLocale } from 'next-intl';
import type { DataCenterResponse } from '@health-advisor/shared';
import { ValoCard } from '@/components/valo/ValoCard';
import { formatSnapshotDate } from './format-snapshot-date';

/**
 * ActivityDetailView —— Activity tab 的"快照"详情卡。
 *
 * 数据来源：DataCenterResponse.timeline 最后一个采样点。该点代表的是
 * **当前 timeframe 的最后一日**，并非一定是「今天」：day 视图下确实是今日，
 * 但 week/month 视图下是窗口的最后一天。Header 渲染的 `snapshotDate` 副标题
 * 让用户明确看到具体是哪一天。后端 TAB_METRICS.activity 暴露
 * activity.steps / activity.calories / activity.activeMinutes / activity.distanceKm。
 *
 * 设计规则（与 I4.2 plan 对齐）：
 * - distanceKm 是本次任务的核心新增；其他三项沿用既有指标
 * - 不生成不存在的数据 —— 缺失字段显示 "—"
 * - 仅引用 var(--valo-*) token
 *
 * 布局：移动端 2x2 网格，桌面端 1x4。
 */
export interface ActivityDetailViewProps {
  data?: DataCenterResponse | null;
}

/** 渲染单个统计项所需的一切（避免依赖 sentinel） */
interface ActivityStatRuntime {
  metricKey: string;
  label: string;
  unit: string;
  grouped?: boolean;
  decimals?: number;
}

export function ActivityDetailView({ data }: ActivityDetailViewProps) {
  const t = useTranslations('dataCenter.activityDetail');
  const locale = useLocale();
  const noData = t('noData');

  // 取最近一日采样点
  const latest = data?.timeline?.at(-1);
  const values = latest?.values ?? {};

  // 快照日期副标题文本（locale-aware）。week/month 视图下不一定为今日
  const snapshotDate = latest?.date ?? null;
  const snapshotLabel = snapshotDate ? formatSnapshotDate(snapshotDate, locale) : null;

  // 4 项统计配置：label/unit 由 i18n 提供；steps 没有单位文本（空串）
  const stats: ActivityStatRuntime[] = [
    {
      metricKey: 'activity.steps',
      label: t('stepsLabel'),
      unit: '',
      grouped: true,
    },
    {
      metricKey: 'activity.distanceKm',
      label: t('distanceLabel'),
      unit: t('distanceUnit'),
      decimals: 1,
    },
    {
      metricKey: 'activity.calories',
      label: t('caloriesLabel'),
      unit: t('caloriesUnit'),
    },
    {
      metricKey: 'activity.activeMinutes',
      label: t('activeMinutesLabel'),
      unit: t('activeMinutesUnit'),
    },
  ];

  return (
    <div
      className="space-y-3"
      data-valo-trends-activity-detail
    >
      {/* 快照日期副标题：week/month 视图下并非总是今日；缺失时整体隐藏 */}
      {snapshotLabel && snapshotDate ? (
        <p
          className="text-xs text-[var(--valo-text-secondary)]"
          data-valo-activity-snapshot-date
        >
          <time dateTime={snapshotDate}>{t('snapshotLabel')}: {snapshotLabel}</time>
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => {
          const raw = values[stat.metricKey] ?? null;
          return (
            <ValoCard key={stat.metricKey} as="section" aria-label={stat.label}>
              <p className="text-xs uppercase tracking-wide text-[var(--valo-text-secondary)]">
                {stat.label}
              </p>
              <p
                className="mt-2 text-2xl font-bold tabular-nums text-[var(--valo-text-primary)]"
                data-valo-activity-stat={stat.metricKey}
              >
                {raw != null ? formatStatValue(raw, stat) : noData}
              </p>
              {stat.unit ? (
                <p className="mt-1 text-xs text-[var(--valo-text-secondary)]">{stat.unit}</p>
              ) : null}
            </ValoCard>
          );
        })}
      </div>
    </div>
  );
}

/** 根据配置格式化数值 */
function formatStatValue(value: number, config: ActivityStatRuntime): string {
  if (config.grouped) {
    return Math.round(value).toLocaleString();
  }
  if (typeof config.decimals === 'number') {
    return value.toFixed(config.decimals);
  }
  return Math.round(value).toString();
}
