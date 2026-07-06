'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type {
  DataCenterResponse,
  SandboxProfile,
} from '@health-advisor/shared';
import { useLocale } from 'next-intl';
import { ValoCard } from '@/components/valo/ValoCard';
import { formatSnapshotDate } from './format-snapshot-date';

/**
 * SleepDetailView —— Sleep tab 的"快照"详情卡。
 *
 * 数据来源：DataCenterResponse.timeline 最后一个采样点。该点代表的是
 * **当前 timeframe 的最后一日**，并非一定是「今天」：day 视图下确实是今日，
 * 但 week/month 视图下是窗口的最后一天。Header 渲染的 `snapshotDate` 副标题
 * 让用户明确看到具体是哪一天。
 *
 * timeline 每个点的 values 仅包含后端 TAB_METRICS.sleep 声明的字段：
 *   - sleep.totalMinutes
 *   - sleep.score
 *   - sleep.stages.deep / rem / light / awake
 *
 * sleep.stages.awake 已加入 TAB_METRICS.sleep；本组件对仍然缺失的值保持宽容，
 * 显示 "—"（demo 数据或同步中断等场景可能缺失某个分期）。
 *
 * 设计规则（与 I4.2 plan 对齐）：
 * - 不伪造 sleep.score —— score 是独立字段，不通过其他指标推算
 * - 不生成不存在的数据 —— 缺失字段显示 "—"，绝不凭空捏造
 * - 仅引用 var(--valo-*) token，不出现硬编码颜色
 */

/** 4 个睡眠分期 + 显示顺序；与 shared SleepStages 对齐 */
const STAGE_KEYS = ['deep', 'light', 'rem', 'awake'] as const;
type StageKey = (typeof STAGE_KEYS)[number];

/** 分期 → 翻译键 */
const STAGE_LABEL_KEY: Record<StageKey, string> = {
  deep: 'stageDeep',
  light: 'stageLight',
  rem: 'stageRem',
  awake: 'stageAwake',
};

/** 分期 → valo token 颜色（CSS 变量字符串，仅 token） */
const STAGE_COLOR_VAR: Record<StageKey, string> = {
  deep: 'var(--valo-prime)',
  light: 'var(--valo-text-secondary)',
  rem: 'var(--valo-active)',
  awake: 'var(--valo-text-secondary)',
};

export interface SleepDetailViewProps {
  /** data-center 主查询返回；为 null/undefined 时整体进入空态 */
  data?: DataCenterResponse | null;
  /** 当前 profile，用于读取 baseline.avgSleepMinutes 作为"个人参考目标" */
  profile?: SandboxProfile | null;
}

/**
 * 把分钟数渲染为 "Xh Ym" 文本；< 60 分钟时仅显示分钟。
 */
function formatDuration(totalMinutes: number, unitH: string, unitM: string): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);
  if (hours === 0) return `${mins}${unitM}`;
  if (mins === 0) return `${hours}${unitH}`;
  return `${hours}${unitH} ${mins}${unitM}`;
}

export function SleepDetailView({ data, profile }: SleepDetailViewProps) {
  const t = useTranslations('dataCenter.sleepDetail');
  const locale = useLocale();

  // 取最近一日采样点（timeline 末尾）；缺失时整体渲染空态
  const latest = data?.timeline?.at(-1);
  const values = latest?.values ?? {};

  // 快照日期副标题文本（locale-aware）。week/month 视图下不一定为今日
  const snapshotDate = latest?.date ?? null;
  const snapshotLabel = snapshotDate ? formatSnapshotDate(snapshotDate, locale) : null;

  const totalMinutes = values['sleep.totalMinutes'] ?? null;
  const score = values['sleep.score'] ?? null;
  const stages: Record<StageKey, number | null> = {
    deep: values['sleep.stages.deep'] ?? null,
    light: values['sleep.stages.light'] ?? null,
    rem: values['sleep.stages.rem'] ?? null,
    awake: values['sleep.stages.awake'] ?? null,
  };

  // 个人参考目标：profile.baseline.avgSleepMinutes（可能未设置）
  const goalMinutes = profile?.baseline?.avgSleepMinutes ?? null;

  // 完成度：totalMinutes / goal；不伪造一致性
  const completionPct = useMemo(() => {
    if (totalMinutes == null || goalMinutes == null || goalMinutes <= 0) return null;
    return Math.round((totalMinutes / goalMinutes) * 100);
  }, [totalMinutes, goalMinutes]);

  // 睡眠效率 = 睡眠时长 / (睡眠时长 + 清醒时长)，等价于 totalMinutes / 在床时长
  // sleep.startTime / endTime 未在 TAB_METRICS 暴露，故不直接用 ISO 时长计算；
  // awake 虽已加入 TAB_METRICS.sleep，但 demo/同步异常时仍可能缺失；
  // 当 awake 或 totalMinutes 任一缺失时，效率不可推导 → 显示 —（不伪造）
  const efficiencyPct = useMemo(() => {
    if (totalMinutes == null || totalMinutes <= 0) return null;
    if (stages.awake == null) return null;
    const inBed = totalMinutes + stages.awake;
    if (inBed <= 0) return null;
    return Math.round(Math.min(100, (totalMinutes / inBed) * 100));
  }, [totalMinutes, stages.awake]);

  const noData = t('noData');

  return (
    <div className="space-y-4" data-valo-trends-sleep-detail>
      {/* 快照日期副标题：week/month 视图下并非总是今日；缺失时整体隐藏 */}
      {snapshotLabel && snapshotDate ? (
        <p
          className="text-xs text-[var(--valo-text-secondary)]"
          data-valo-sleep-snapshot-date
        >
          <time dateTime={snapshotDate}>{t('snapshotLabel')}: {snapshotLabel}</time>
        </p>
      ) : null}
      {/* 时长 + 目标完成 */}
      <ValoCard as="section" aria-label={t('durationTitle')}>
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--valo-text-secondary)]">
              {t('durationTitle')}
            </p>
            <p
              className="mt-1 text-4xl font-bold tabular-nums text-[var(--valo-text-primary)]"
              data-valo-sleep-duration
            >
              {totalMinutes != null
                ? formatDuration(totalMinutes, t('durationUnit'), t('durationMinute'))
                : noData}
            </p>
          </div>
          <div className="text-right" data-valo-sleep-completion>
            {completionPct != null ? (
              <>
                <p className="text-2xl font-semibold tabular-nums text-[var(--valo-active)]">
                  {completionPct}%
                </p>
                <p className="text-xs text-[var(--valo-text-secondary)]">
                  {t('completionLabel')}
                </p>
              </>
            ) : (
              <p className="text-xs text-[var(--valo-text-secondary)]">
                {t('completionNoGoal')}
              </p>
            )}
          </div>
        </div>
      </ValoCard>

      {/* 睡眠分期 */}
      <ValoCard as="section" aria-label={t('stagesTitle')}>
        <p className="text-xs uppercase tracking-wide text-[var(--valo-text-secondary)]">
          {t('stagesTitle')}
        </p>
        <div
          className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4"
          data-valo-sleep-stages
        >
          {STAGE_KEYS.map((key) => (
            <StageCell
              key={key}
              label={t(STAGE_LABEL_KEY[key])}
              minutes={stages[key]}
              minuteUnit={t('durationMinute')}
              colorVar={STAGE_COLOR_VAR[key]}
              noData={noData}
            />
          ))}
        </div>
      </ValoCard>

      {/* 效率 + 得分 */}
      <div className="grid grid-cols-2 gap-4">
        <ValoCard as="section" aria-label={t('efficiencyTitle')}>
          <p className="text-xs uppercase tracking-wide text-[var(--valo-text-secondary)]">
            {t('efficiencyTitle')}
          </p>
          <p
            className="mt-1 text-3xl font-bold tabular-nums text-[var(--valo-text-primary)]"
            data-valo-sleep-efficiency
          >
            {efficiencyPct != null ? `${efficiencyPct}${t('efficiencyUnit')}` : noData}
          </p>
        </ValoCard>
        <ValoCard as="section" aria-label={t('scoreTitle')}>
          <p className="text-xs uppercase tracking-wide text-[var(--valo-text-secondary)]">
            {t('scoreTitle')}
          </p>
          <p
            className="mt-1 text-3xl font-bold tabular-nums text-[var(--valo-prime)]"
            data-valo-sleep-score
          >
            {score != null ? score : noData}
          </p>
        </ValoCard>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Stage 单元                                                    */
/* ────────────────────────────────────────────────────────────── */

function StageCell({
  label,
  minutes,
  minuteUnit,
  colorVar,
  noData,
}: {
  label: string;
  minutes: number | null;
  minuteUnit: string;
  colorVar: string;
  noData: string;
}) {
  return (
    <div
      className="rounded-xl border border-[var(--valo-border)] bg-[var(--valo-surface)] p-3"
      data-valo-sleep-stage-cell={label}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: colorVar }}
        />
        <span className="text-xs text-[var(--valo-text-secondary)]">{label}</span>
      </div>
      <p className="mt-2 text-xl font-semibold tabular-nums text-[var(--valo-text-primary)]">
        {minutes != null ? `${minutes}${minuteUnit}` : noData}
      </p>
    </div>
  );
}
