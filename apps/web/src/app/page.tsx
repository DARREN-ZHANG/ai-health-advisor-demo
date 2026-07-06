'use client';

import { useEffect, useRef, useState } from 'react';
import { Container, Section, Button } from '@health-advisor/ui';
import { HomeHeader } from '@/components/homepage/HomeHeader';
import { HealthHero } from '@/components/homepage/HealthHero';
import { SwitchStatusDialog } from '@/components/homepage/SwitchStatusDialog';
import { BriefTimeline } from '@/components/homepage/BriefTimeline';
import { ActionCard } from '@/components/homepage/ActionCard';
import { ActionTimerSheet } from '@/components/homepage/ActionTimerSheet';
import { AppointmentSheet } from '@/components/homepage/AppointmentSheet';
import { ValoCard } from '@/components/valo/ValoCard';
import { ActiveSensingBanner } from '@/components/layout/ActiveSensingBanner';
import { LifeLogPanel } from '@/components/life-log/LifeLogPanel';
import { useProfileStore } from '@/stores/profile.store';
import {
  useHealthStatusStore,
  selectActiveVisualState,
} from '@/stores/health-status.store';
import { mapApiStatusToVisualState } from '@/lib/health-visual-state';
import { useMorningBrief, useRefetchBrief } from '@/hooks/use-ai-query';
import { useActionInteractions } from '@/hooks/use-action-interactions';
import { useUIStore } from '@/stores/ui.store';
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
 *  - ActionCard 渲染 Yes / Not Now（collapse after interact）
 *  - micro_event 带 durationMinutes 打开 ActionTimerSheet
 *  - calendar 互动打开 AppointmentSheet（仅记录，不调用外部日历）
 *  - 下午/晚间为 Figma 静态双语示例文案，不归属 Agent 输出。
 */
export default function HomePage() {
  const { currentProfileId } = useProfileStore();
  const { showToast } = useUIStore();
  const { data, isLoading, error, isFetching, dataUpdatedAt } =
    useMorningBrief(currentProfileId);
  const refetchBrief = useRefetchBrief(currentProfileId);
  const t = useTranslations('homepage');

  const interactions = useActionInteractions(currentProfileId);
  const briefIsLoading = isLoading || isFetching || refetchBrief.isPending;

  // —— Hero 状态管理 ——
  const activeState = useHealthStatusStore(selectActiveVisualState);
  const setAutoState = useHealthStatusStore((s) => s.setAutoState);
  const setManualOverride = useHealthStatusStore((s) => s.setManualOverride);

  const apiStatus = data?.statusColor;
  const visualState = mapApiStatusToVisualState(apiStatus, !!data);

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
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === 'TIMEOUT';
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

  const summary =
    data?.summary ||
    (error ? t('briefNetworkError') : t('briefPreparing'));
  const actions = data?.actions ?? [];

  // 已记录/已加入日历/正在 Timer 或 Appointment 中 的 action 不再渲染为可交互卡片，
  // 避免用户在浮层打开期间重复点击 Yes。
  const visibleActions = actions.filter(
    (a) =>
      !interactions.selectedActionIds.has(a.id) &&
      !interactions.calendarActionIds.has(a.id) &&
      a.id !== interactions.timerAction?.id &&
      a.id !== interactions.appointmentAction?.id,
  );

  // 当前 Timer 的总秒数
  const timerDurationSeconds =
    interactions.timerAction?.interaction?.kind === 'micro_event'
      ? Math.max(
          1,
          Math.round(
            (interactions.timerAction.interaction.microEvent.durationMinutes ??
              0) * 60,
          ),
        )
      : 0;

  return (
    <Container className="py-6">
      <div className="space-y-6">
        <HomeHeader />

        <HealthHero
          ref={ringRef}
          state={activeState}
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

        {/* 顶部标题栏：保留刷新按钮 */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--valo-text-primary)]">
              {t('realtimeBrief')}
            </h1>
            <p className="text-sm text-[var(--valo-text-secondary)]">
              {describeBriefSource(data?.source, t)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => refetchBrief.mutate()}
              disabled={briefIsLoading}
              className="text-xs h-auto py-1 px-2"
            >
              {refetchBrief.isPending ? t('refreshing') : t('manualRefresh')}
            </Button>
          </div>
        </header>

        <ActiveSensingBanner />

        {/* Now 简报 */}
        <Section title={t('realtimeBrief')} className="space-y-4">
          <BriefTimeline
            summary={summary}
            microTips={data?.microTips}
            isLoading={briefIsLoading && !data}
          />

          {visibleActions.length > 0 ? (
            <ul className="space-y-3 list-none p-0 m-0">
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
          ) : null}
        </Section>

        {/* 下午/晚间：Figma 静态双语示例，非 Agent 输出 */}
        <Section title={t('afternoon.title')} className="space-y-4">
          <ValoCard as="section" aria-label={t('afternoon.title')}>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-[var(--valo-text-primary)]">
                {t('afternoon.title')}
              </h2>
              <p className="text-sm text-[var(--valo-text-secondary)] leading-relaxed">
                {t('afternoon.body')}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-[var(--valo-text-secondary)] mt-2">
                Static example
              </p>
            </div>
          </ValoCard>
        </Section>

        <Section title={t('night.title')} className="space-y-4">
          <ValoCard as="section" aria-label={t('night.title')}>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-[var(--valo-text-primary)]">
                {t('night.title')}
              </h2>
              <p className="text-sm text-[var(--valo-text-secondary)] leading-relaxed">
                {t('night.body')}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-[var(--valo-text-secondary)] mt-2">
                Static example
              </p>
            </div>
          </ValoCard>
        </Section>

        {/*
          Life Log（profile-scoped，仅当前会话）—— I3.3
          数据为内存原型，不持久化；刷新页面即清空。挂载位置：Afternoon/Night 之后，
          符合 design-manifest.md "下方生命记录区"的版式约定。
        */}
        <LifeLogPanel />

        <div className="h-20" />
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

function describeBriefSource(
  source: string | undefined,
  t: (key: string) => string,
) {
  if (source === 'fallback') {
    return t('sourceFallback');
  }
  return t('sourceLLM');
}
