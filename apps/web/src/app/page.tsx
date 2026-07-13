'use client';

import { useEffect, useRef, useState } from 'react';
import { Container } from '@health-advisor/ui';
import { HomeHeader } from '@/components/homepage/HomeHeader';
import { HealthHero } from '@/components/homepage/HealthHero';
import { SwitchStatusDialog } from '@/components/homepage/SwitchStatusDialog';
import { BriefTimeline } from '@/components/homepage/BriefTimeline';
import { ActionCard } from '@/components/homepage/ActionCard';
import { FutureTimelineBlock } from '@/components/homepage/FutureTimelineBlock';
import { ActionTimerSheet } from '@/components/homepage/ActionTimerSheet';
import { AppointmentSheet } from '@/components/homepage/AppointmentSheet';
import { ActiveSensingBanner } from '@/components/layout/ActiveSensingBanner';
import { LifeLogPanel } from '@/components/life-log/LifeLogPanel';
import { useProfileStore } from '@/stores/profile.store';
import { useGodModeStore } from '@/stores/god-mode.store';
import { useGodModeState } from '@/hooks/use-god-mode-actions';
import { useHealthStatusStore, selectActiveVisualState } from '@/stores/health-status.store';
import { mapApiStatusToVisualState } from '@/lib/health-visual-state';
import { useMorningBrief, useRefetchBrief } from '@/hooks/use-ai-query';
import { useActionInteractions } from '@/hooks/use-action-interactions';
import { useUIStore } from '@/stores/ui.store';
import { useBriefStreamStore } from '@/stores/brief-stream.store';
import { useTranslations } from 'next-intl';
import type { ActionOption } from '@health-advisor/shared';

/**
 * 首页：四态 Hero + Switch Status + 简报 / Action 卡 / Timer。
 *
 * 状态流：
 *  1. useMorningBrief 提供 `statusColor` + `dataUpdatedAt`；
 *  2. mapApiStatusToVisualState 把 API 状态映射为四态视觉；
 *  3. useEffect 把"自动状态 + dataUpdatedAt"写入 store；
 *  4. Hero 从 store 选取当前生效状态；
 *  5. 用户点击 Hero → SwitchStatusDialog → setManualOverride。
 *
 * 简报区（I3.2）：
 *  - BriefTimeline 渲染 summary + microTips（非交互）
 *  - ActionCard 渲染 Yes / Not Now（确认后收起，稍后则直接消失）
 *  - micro_event 带 durationMinutes 打开 ActionTimerSheet
 *  - calendar 互动打开 AppointmentSheet（仅记录，不调用外部日历）
 *  - 下午/晚间为 Figma 静态双语示例文案，不归属 Agent 输出。
 */
export default function HomePage() {
  const { currentProfileId } = useProfileStore();
  const { showToast } = useUIStore();
  const { data, isLoading, error, isFetching, dataUpdatedAt } = useMorningBrief(currentProfileId);
  const refetchBrief = useRefetchBrief(currentProfileId);
  const { data: godModeState } = useGodModeState();
  const t = useTranslations('homepage');

  const interactions = useActionInteractions(currentProfileId);
  // isBriefRefreshing：添加事件后强制刷新简报期间，由 useDemoControlActions 设置。
  // 解决 useRefetchBrief 在不同组件实例间 mutation state 不共享的问题——
  // 抽屉 hook 和首页各自独立的 mutation 实例，isPending 不互通，用 store flag 桥接。
  const isBriefRefreshing = useGodModeStore((s) => s.isBriefRefreshing);

  // —— brief-stream store 订阅（任务 3.2）——
  // 订阅当前 profile 的 draft entry；流式期间 draftSummary 逐步增长，
  // completed/failed 后 entry 清除。直接从 s.entries 取值（而非 s.getEntry()），
  // 让 Zustand selector 的 snapshot 语义生效：begin/append 产生新对象引用触发 re-render，
  // complete/fail 删除 key 返回 undefined 也触发。
  const draftEntry = useBriefStreamStore((s) =>
    currentProfileId ? s.entries[currentProfileId] : undefined,
  );
  const draftSummary = draftEntry?.draftSummary;
  const hasDraft = typeof draftSummary === 'string' && draftSummary.length > 0;

  // briefIsLoading 语义扩展：终态前（draft 期间或刷新中）保持 true。
  // 驱动 Hero/LifeLog disabled，确保结构化字段（status/actions）终态前不可交互。
  const briefIsLoading =
    isLoading ||
    isFetching ||
    refetchBrief.isPending ||
    isBriefRefreshing ||
    hasDraft;
  const isInitialBriefLoading = briefIsLoading && !data;
  const isBriefUpdating = briefIsLoading && !!data;

  // —— Hero 状态管理 ——
  const activeState = useHealthStatusStore(selectActiveVisualState);
  const setAutoState = useHealthStatusStore((s) => s.setAutoState);
  const setManualOverride = useHealthStatusStore((s) => s.setManualOverride);

  const apiStatus = data?.statusColor;
  const visualState = mapApiStatusToVisualState(apiStatus, !!data);
  const isOffline =
    data?.source === 'fallback' || data?.meta.finishReason === 'fallback';

  useEffect(() => {
    if (data) {
      setAutoState(visualState, dataUpdatedAt);
    }
  }, [visualState, dataUpdatedAt, data, setAutoState]);

  // —— Switch Status 弹窗 ——
  const [isSwitchStatusOpen, setIsSwitchStatusOpen] = useState(false);
  const ringRef = useRef<HTMLButtonElement>(null);

  const handleOpenSwitchStatus = () => setIsSwitchStatusOpen(true);
  const handleCloseSwitchStatus = () => setIsSwitchStatusOpen(false);
  const handleSelectStatus = (state: typeof activeState) => {
    setManualOverride(state);
    setIsSwitchStatusOpen(false);
    ringRef.current?.focus();
  };

  // —— 简报错误处理 ——
  useEffect(() => {
    if (error) {
      const isTimeout =
        error instanceof Error && 'code' in error && (error as { code: string }).code === 'TIMEOUT';
      if (!isTimeout) {
        showToast(
          t('briefFetchFailed', {
            error: error instanceof Error ? error.message : t('unknownError'),
          }),
          'error',
        );
      }
    }
  }, [error, showToast, t]);

  // —— 简报显示规则（任务 3.2 六条规则）——
  // effectiveData 始终保留旧 cache（draft 期间 actions/statusColor/futureSuggestions
  // 来自旧 data，completed 后 React Query cache 原子替换）。
  // 规则 4：draft 期间旧结构化字段保留到 completed。
  const effectiveData = data;

  // displayedSummary 优先级：draft > data.summary > fallback
  // 规则 1：无旧数据、无 draft → skeleton（briefIsLoading && !effectiveData && !hasDraft）
  // 规则 2：有 draft → 显示 draftSummary（aria-busy=true 由 BriefTimeline isStreaming 处理）
  // 规则 3：有旧数据、刷新中、无 draft → 保留旧 summary + updating indicator
  // 规则 5：completed → cache 替换，effectiveData.summary 变新
  // 规则 6：failed → draft 清除；首次加载 error，刷新失败保留旧 effectiveData
  const displayedSummary = hasDraft
    ? draftSummary!
    : effectiveData?.summary ||
      (error && !effectiveData ? t('briefNetworkError') : t('briefPreparing'));

  // actions/futureSuggestions 始终来自 effectiveData（旧值），终态后原子替换
  const actions = effectiveData?.actions ?? [];
  // 未来时间点建议：LLM 基于今日已发生活动推断，缺失时降级为静态 Figma 文案
  const futureSuggestions = effectiveData?.futureSuggestions ?? [];

  // 已记录/已加入日历/正在 Timer 或 Appointment 中 的 action 不再渲染为可交互卡片，
  // 避免用户在浮层打开期间重复点击 Yes。
  const visibleActions = actions.filter(
    (a) =>
      !interactions.selectedActionIds.has(a.id) &&
      !interactions.calendarActionIds.has(a.id) &&
      !interactions.dismissedActionIds.has(a.id) &&
      a.id !== interactions.timerAction?.id &&
      a.id !== interactions.appointmentAction?.id,
  );

  // 当前 Timer 的总秒数
  const timerDurationSeconds =
    interactions.timerAction?.interaction?.kind === 'micro_event'
      ? Math.max(
          1,
          Math.round((interactions.timerAction.interaction.microEvent.durationMinutes ?? 0) * 60),
        )
      : 0;

  return (
    <Container className="max-w-[430px] overflow-x-hidden pb-0 pt-0 md:max-w-[430px]">
      <div>
        <HomeHeader />

        <HealthHero
          ref={ringRef}
          state={activeState}
          isLoading={briefIsLoading}
          isOffline={isOffline}
          onOpenSwitchStatus={handleOpenSwitchStatus}
          isSwitchStatusOpen={isSwitchStatusOpen}
          switchStatusDialogId="switch-status-dialog"
        />

        <SwitchStatusDialog
          open={isSwitchStatusOpen}
          onClose={handleCloseSwitchStatus}
          current={activeState}
          onSelect={handleSelectStatus}
          triggerRef={ringRef}
        />

        <div className="mt-10 space-y-8">
          <ActiveSensingBanner />

          <div className="relative space-y-8" data-valo-timeline-stack="">
            <span
              aria-hidden="true"
              className="absolute bottom-0 left-[7px] top-5 w-px bg-[color-mix(in_srgb,var(--valo-prime)_48%,transparent)]"
              data-valo-timeline-line=""
            />

            <BriefTimeline
              summary={displayedSummary}
              currentTime={godModeState?.currentDemoTime ?? undefined}
              isLoading={briefIsLoading && !effectiveData && !hasDraft}
              isUpdating={isBriefUpdating}
              isStreaming={hasDraft}
            />

            {visibleActions.length > 0 ? (
              <div className="-mt-2 ml-8 overflow-hidden" data-valo-action-tips-viewport="">
                <ul
                  className="flex list-none gap-3 overflow-x-auto overscroll-x-none p-0 pb-1 after:block after:w-5 after:shrink-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  data-valo-action-tips=""
                >
                  {visibleActions.map((action: ActionOption) => (
                    <ActionCard
                      key={action.id}
                      action={action}
                      onYes={interactions.handleYes}
                      onNotNow={interactions.handleNotNow}
                      pending={interactions.pendingActionId === action.id}
                    />
                  ))}
                </ul>
              </div>
            ) : null}

            {/* 下午/晚间：LLM futureSuggestions 优先；响应到达后仍缺失才降级到 Figma 静态文案 */}
            {futureSuggestions.length > 0 ? (
              futureSuggestions.map((suggestion) => (
                <FutureTimelineBlock key={suggestion.action.id} suggestion={suggestion} />
              ))
            ) : isInitialBriefLoading ? // LLM 响应中：暂不展示静态降级，避免响应到达后被替换造成闪烁
            null : (
              <>
                <StaticTimelineBlock title={t('afternoon.title')} time="15:00 PM">
                  {t('afternoon.body')}
                </StaticTimelineBlock>

                <StaticTimelineBlock title={t('night.title')} time="22:45 PM">
                  {t('night.body')}
                </StaticTimelineBlock>
              </>
            )}
          </div>

          {/*
            Life Log（profile-scoped，仅当前会话）—— I3.3
            数据为内存原型，不持久化；刷新页面即清空。挂载位置：Afternoon/Night 之后，
            符合 design-manifest.md "下方生命记录区"的版式约定。
          */}
          <LifeLogPanel disabled={briefIsLoading} />
        </div>
      </div>

      {/* Timer 浮层（micro_event 带 duration） */}
      {interactions.timerAction ? (
        <ActionTimerSheet
          open={!!interactions.timerAction}
          durationSeconds={timerDurationSeconds}
          title={interactions.timerAction.title}
          onComplete={interactions.handleTimerComplete}
          onStop={interactions.handleTimerStop}
        />
      ) : null}

      {/* Appointment 浮层（calendar 行动） */}
      {interactions.appointmentAction ? (
        <AppointmentSheet
          open={!!interactions.appointmentAction}
          title={t('appointment.title')}
          description={interactions.appointmentAction.description}
          onClose={interactions.handleAppointmentClose}
          onConfirm={interactions.handleAppointmentConfirm}
        />
      ) : null}
    </Container>
  );
}

function StaticTimelineBlock({
  title,
  time,
  children,
}: {
  title: string;
  time: string;
  children: React.ReactNode;
}) {
  return (
    <section className="relative pl-8">
      <span
        aria-hidden="true"
        className="absolute left-0 top-1 h-4 w-4 rounded-full bg-[var(--valo-prime)] shadow-[0_0_10px_var(--valo-prime)]"
      />
      <h2
        className="text-sm font-medium leading-5 text-[var(--valo-text-primary)]"
        data-valo-serif="true"
      >
        {title} - {time}
      </h2>
      <p className="mt-3 text-sm leading-5 text-[color-mix(in_srgb,var(--valo-text-primary)_82%,transparent)]">
        {children}
      </p>
    </section>
  );
}
