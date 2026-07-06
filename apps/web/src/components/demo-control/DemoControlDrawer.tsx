'use client';

import { useTranslations } from 'next-intl';
import { XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { ValoSheet } from '@/components/valo/ValoSheet';
import { ValoDialog } from '@/components/valo/ValoDialog';
import { useGodModeStore } from '@/stores/god-mode.store';
import {
  TIMELINE_SEGMENT_GROUPS,
  TIMELINE_SEGMENTS_BY_GROUP,
} from './timeline-segments';
import type {
  TimelineSegmentConfig,
  TimelineSegmentGroup,
  TimelineSegmentType,
} from './types';
import { TimelineSegmentCard } from './TimelineSegmentCard';
import {
  RecentEventsDisclosure,
  type RecentEventEntry,
} from './RecentEventsDisclosure';

/**
 * 抽屉接受的可选回调与 pending 状态。
 *
 * I2.2 仅暴露这些 props，不接通任何 mutation；I2.3 会传入真实的
 * `appendTimeline` / `advanceClock` / `resetTimeline` 调用与 pending 跟踪。
 */
export interface DemoControlDrawerProps {
  /** 点击某个 segment 卡片 */
  onSegmentClick?: (segment: TimelineSegmentConfig) => void;
  /** 点击 +1h */
  onAdvanceHour?: () => void;
  /** 点击重置 */
  onReset?: () => void;
  /** 当前正在变更的 segmentType（来自 god-mode store，I2.3 写入） */
  pendingSegmentType?: TimelineSegmentType | null;
  /** 当前正在执行的底部动作（来自 god-mode store，I2.3 写入） */
  pendingAction?: 'advance' | 'reset' | null;
  /**
   * 近期事件来源；默认从 god-mode store 的 pending 状态推断为空数组。
   * I2.3 接通 useGodModeState 后会把 recentRecognizedEvents 传入。
   */
  events?: ReadonlyArray<RecentEventEntry>;
  /** 当前演示时间 ISO 字符串；I2.3 接入后会从 useGodModeState() 注入 */
  currentDemoTime?: string | null;
}

const GROUP_TITLE_KEY: Readonly<Record<TimelineSegmentGroup, string>> = {
  'daily-rhythm': 'groupDailyRhythm',
  'sport-training': 'groupSportTraining',
  'state-intake': 'groupStateIntake',
};

/**
 * Demo Control Drawer —— 同时承载移动端 Bottom Sheet（92dvh）
 * 与桌面端右侧 Drawer（480px）。
 *
 * - 仅在 `isEnabled && isOpen` 时渲染。
 * - 移动端使用 ValoSheet（default → lg），桌面端使用 ValoDialog variant=drawer
 *   （lg 及以上）。两者通过 Tailwind 响应式类切换显隐。
 * - 内容部分抽成 `<DemoControlContent>`，避免重复 JSX。
 * - 不调用任何 mutation；pending 状态由调用方传入。
 */
export function DemoControlDrawer({
  onSegmentClick,
  onAdvanceHour,
  onReset,
  pendingSegmentType,
  pendingAction,
  events = [],
  currentDemoTime = null,
}: DemoControlDrawerProps) {
  const isEnabled = useGodModeStore((s) => s.isEnabled);
  const isOpen = useGodModeStore((s) => s.isOpen);
  const toggleOpen = useGodModeStore((s) => s.toggleOpen);

  if (!isEnabled || !isOpen) return null;

  const sharedContent = (
    <DemoControlContent
      onSegmentClick={onSegmentClick}
      onAdvanceHour={onAdvanceHour}
      onReset={onReset}
      pendingSegmentType={pendingSegmentType}
      pendingAction={pendingAction}
      events={events}
      currentDemoTime={currentDemoTime}
      onClose={() => toggleOpen(false)}
    />
  );

  return (
    <>
      {/*
       * 注意：移动端与桌面端两层 overlay 同时挂载到 DOM，靠 Tailwind 的
       * `block lg:hidden` 与 `hidden lg:block` 在不同断点切换可见性。
       *
       * 这意味着 jsdom（不解析 Tailwind 断点）会同时看到两个 role=dialog；
       * 为了让测试与 I2.3 的 mutation 接入更直观，给两层加上 data-valo-viewport
       * 标识，测试方可以基于此做 scoped 查询，避免因双 DOM 导致的查询歧义。
       */}
      <div className="block lg:hidden" data-valo-viewport="mobile">
        <ValoSheet
          open={isOpen}
          onClose={() => toggleOpen(false)}
          variant="bottom-sheet"
          height="92dvh"
          ariaLabel="Demo Control"
        >
          {sharedContent}
        </ValoSheet>
      </div>
      <div className="hidden lg:block" data-valo-viewport="desktop">
        <ValoDialog
          open={isOpen}
          onClose={() => toggleOpen(false)}
          variant="drawer"
          width={480}
          ariaLabel="Demo Control"
        >
          {sharedContent}
        </ValoDialog>
      </div>
    </>
  );
}

interface DemoControlContentProps {
  onSegmentClick?: (segment: TimelineSegmentConfig) => void;
  onAdvanceHour?: () => void;
  onReset?: () => void;
  pendingSegmentType?: TimelineSegmentType | null;
  pendingAction?: 'advance' | 'reset' | null;
  events: ReadonlyArray<RecentEventEntry>;
  currentDemoTime: string | null;
  onClose: () => void;
}

function DemoControlContent({
  onSegmentClick,
  onAdvanceHour,
  onReset,
  pendingSegmentType = null,
  pendingAction = null,
  events,
  currentDemoTime,
  onClose,
}: DemoControlContentProps) {
  const t = useTranslations('demoControl');

  const isAdvancePending = pendingAction === 'advance';
  const isResetPending = pendingAction === 'reset';

  return (
    <div className="flex h-full flex-col">
      {/* ---------- Header（sticky 顶部） ---------- */}
      <header
        className={
          'sticky top-0 z-10 flex items-center justify-between gap-3 border-b ' +
          'border-[var(--valo-border)] bg-[var(--valo-surface)] px-4 py-3'
        }
      >
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-[var(--valo-text-primary)]">
            {t('title')}
          </h2>
          <LivePill />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close')}
          data-valo-touch="true"
          className={
            'rounded-full p-2 text-[var(--valo-text-secondary)] transition-colors ' +
            'hover:bg-[var(--valo-border)] hover:text-[var(--valo-text-primary)]'
          }
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </header>

      {/* ---------- 内容滚动区 ---------- */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <SummaryArea events={events} currentDemoTime={currentDemoTime} />
        {TIMELINE_SEGMENT_GROUPS.map((group) => (
          <SegmentGroupSection
            key={group}
            group={group}
            onSegmentClick={onSegmentClick}
            pendingSegmentType={pendingSegmentType}
          />
        ))}
      </div>

      {/* ---------- Footer（sticky 底部） ---------- */}
      <footer
        className={
          'sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t ' +
          'border-[var(--valo-border)] bg-[var(--valo-surface)] px-4 py-3'
        }
      >
        <button
          type="button"
          onClick={onAdvanceHour}
          disabled={isAdvancePending}
          data-valo-touch="true"
          className={
            'inline-flex items-center gap-1 rounded-xl px-4 py-2 text-sm font-semibold ' +
            'text-[var(--valo-canvas)] transition-opacity hover:opacity-90 ' +
            'disabled:opacity-50'
          }
          style={{ backgroundColor: 'var(--valo-prime)' }}
        >
          {isAdvancePending ? (
            <ArrowPathIcon className="h-4 w-4 animate-spin" />
          ) : null}
          {t('advanceOneHour')}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={isResetPending}
          data-valo-touch="true"
          className={
            'inline-flex items-center gap-1 rounded-xl border border-[var(--valo-border)] ' +
            'px-4 py-2 text-sm font-semibold text-[var(--valo-depleted)] ' +
            'transition-colors hover:bg-[var(--valo-border)] disabled:opacity-50'
          }
        >
          {isResetPending ? (
            <ArrowPathIcon className="h-4 w-4 animate-spin" />
          ) : null}
          {t('reset')}
        </button>
      </footer>
    </div>
  );
}

function LivePill() {
  const t = useTranslations('demoControl');
  return (
    <span
      className={
        'inline-flex items-center gap-1 rounded-full border border-[var(--valo-border)] ' +
        'bg-[var(--valo-canvas)] px-2 py-0.5 text-xs font-semibold ' +
        'text-[var(--valo-active)]'
      }
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--valo-active)]" />
      {t('live')}
    </span>
  );
}

interface SummaryAreaProps {
  events: ReadonlyArray<RecentEventEntry>;
  currentDemoTime: string | null;
}

function SummaryArea({ events, currentDemoTime }: SummaryAreaProps) {
  const t = useTranslations('demoControl');
  const timeText = formatClock(currentDemoTime);
  return (
    <section
      className={
        'rounded-2xl border border-[var(--valo-border)] bg-[var(--valo-surface)] p-4 ' +
        'shadow-[var(--valo-shadow-card)]'
      }
    >
      <div className="flex items-center gap-4">
        <div className="flex flex-col">
          <span className="text-xs text-[var(--valo-text-secondary)]">
            {t('currentTime')}
          </span>
          <span
            className="text-2xl font-semibold text-[var(--valo-text-primary)]"
            data-valo-clock="true"
          >
            {timeText}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-[var(--valo-text-secondary)]">
            {t('events')}
          </span>
          <span
            className="text-2xl font-semibold text-[var(--valo-text-primary)]"
            data-valo-event-count="true"
          >
            {events.length}
          </span>
        </div>
      </div>
      <div className="mt-2">
        <RecentEventsDisclosure events={events} />
      </div>
    </section>
  );
}

interface SegmentGroupSectionProps {
  group: TimelineSegmentGroup;
  onSegmentClick?: (segment: TimelineSegmentConfig) => void;
  pendingSegmentType?: TimelineSegmentType | null;
}

function SegmentGroupSection({
  group,
  onSegmentClick,
  pendingSegmentType = null,
}: SegmentGroupSectionProps) {
  const t = useTranslations('demoControl');
  const segments = TIMELINE_SEGMENTS_BY_GROUP[group];
  const titleKey = GROUP_TITLE_KEY[group];
  return (
    <section data-valo-group={group}>
      <header className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-[var(--valo-text-primary)]">
          {t(titleKey)}
        </h3>
        <span className="text-xs text-[var(--valo-text-secondary)]">
          {t('segmentCount', { count: segments.length })}
        </span>
      </header>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {segments.map((segment) => (
          <TimelineSegmentCard
            key={segment.type}
            segment={segment}
            onClick={onSegmentClick ? () => onSegmentClick(segment) : undefined}
            loading={pendingSegmentType === segment.type}
          />
        ))}
      </div>
    </section>
  );
}

/** 将 YYYY-MM-DDTHH:mm 转为 HH:MM；无值时返回占位 */
function formatClock(iso: string | null): string {
  if (!iso) return '--:--';
  const timePart = iso.includes('T') ? iso.split('T')[1] : iso;
  return (timePart ?? '').slice(0, 5) || '--:--';
}
