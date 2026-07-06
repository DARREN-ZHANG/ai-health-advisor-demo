'use client';

import { useEffect, useRef, useState } from 'react';
import { Container, Section, Button } from '@health-advisor/ui';
import { MorningBriefCard } from '@/components/homepage/MorningBriefCard';
import { HomeHeader } from '@/components/homepage/HomeHeader';
import { HealthHero } from '@/components/homepage/HealthHero';
import { SwitchStatusDialog } from '@/components/homepage/SwitchStatusDialog';
import { ActiveSensingBanner } from '@/components/layout/ActiveSensingBanner';
import { useProfileStore } from '@/stores/profile.store';
import {
  useHealthStatusStore,
  selectActiveVisualState,
} from '@/stores/health-status.store';
import { mapApiStatusToVisualState } from '@/lib/health-visual-state';
import { useMorningBrief, useRefetchBrief } from '@/hooks/use-ai-query';
import { useActionInteractions } from '@/hooks/use-action-interactions';
import { useUIStore } from '@/stores/ui.store';
import type { StatusColor } from '@health-advisor/ui';
import { useTranslations } from 'next-intl';

/**
 * 首页：四态 Hero + Switch Status + 简报。
 *
 * I3.1：接入 HealthHero / HomeHeader / SwitchStatusDialog 与
 * `useHealthStatusStore`。状态流：
 *  1. useMorningBrief 提供 `statusColor` + `dataUpdatedAt`；
 *  2. mapApiStatusToVisualState 把 API 状态映射为四态视觉；
 *  3. useEffect 把"自动状态 + dataUpdatedAt"写入 store（新简报清除 manualOverride）；
 *  4. Hero 从 store 选取当前生效状态并渲染；
 *  5. 用户点击 Hero → SwitchStatusDialog → setManualOverride 立即生效。
 *
 * 简报与 ActionCard 区域由 I3.2 重构；本任务保留 MorningBriefCard 现状。
 */
export default function HomePage() {
  const { currentProfileId } = useProfileStore();
  const { showToast } = useUIStore();
  const { data, isLoading, error, isFetching, dataUpdatedAt } =
    useMorningBrief(currentProfileId);
  const refetchBrief = useRefetchBrief(currentProfileId);
  const t = useTranslations('homepage');

  const actionInteractions = useActionInteractions(currentProfileId);
  const briefIsLoading = isLoading || isFetching || refetchBrief.isPending;

  // —— Hero 状态管理 ——
  const activeState = useHealthStatusStore(selectActiveVisualState);
  const setAutoState = useHealthStatusStore((s) => s.setAutoState);
  const setManualOverride = useHealthStatusStore((s) => s.setManualOverride);

  const apiStatus = data?.statusColor;
  const visualState = mapApiStatusToVisualState(apiStatus, !!data);

  useEffect(() => {
    if (data) {
      // dataUpdatedAt 是 TanStack Query 标准 ms 时间戳；store 内部比较它是否
      // 变化来决定是否清空 manualOverride。新简报到达 → 清空；同周期刷新 → 保留。
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
    // 焦点返回圆环：useOverlayBehavior 通常已处理，这里兜底确保集成稳定
    ringRef.current?.focus();
  };

  // —— 简报错误处理 ——

  useEffect(() => {
    if (error) {
      const isTimeout = error instanceof Error && 'code' in error && (error as { code: string }).code === 'TIMEOUT';
      if (!isTimeout) {
        showToast(
          t('briefFetchFailed', { error: error instanceof Error ? error.message : t('unknownError') }),
          'error'
        );
      }
    }
  }, [error, showToast, t]);

  const briefData = {
    status: mapApiStatusToUi(data?.statusColor, data?.meta.finishReason),
    title: t('realtimeBrief'),
    summary: data?.summary || (error ? t('briefNetworkError') : t('briefPreparing')),
    actions: data?.actions ?? [],
    actionsSectionTitle: data?.actionsSectionTitle,
    onActionSelect: actionInteractions.selectAction,
    onAddCalendarAction: actionInteractions.addCalendarAction,
    pendingActionId: actionInteractions.pendingActionId,
    selectedActionIds: actionInteractions.selectedActionIds,
    calendarActionIds: actionInteractions.calendarActionIds,
    actionsDisabled: actionInteractions.isBusy,
  };

  return (
    <Container className="py-6">
      <div className="space-y-6">
        {/* HomeHeader：Avatar（占位） + DemoControlTrigger（God Mode 启用时） */}
        <HomeHeader />

        {/* 四态 Hero：圆环是 Switch Status 的唯一入口 */}
        <HealthHero
          ref={ringRef}
          state={activeState}
          onOpenSwitchStatus={handleOpenSwitchStatus}
          isSwitchStatusOpen={isSwitchStatusOpen}
          switchStatusDialogId="switch-status-dialog"
        />

        {/* Switch Status 弹窗：移动端 Sheet + 桌面端 Dialog */}
        <SwitchStatusDialog
          open={isSwitchStatusOpen}
          onClose={handleCloseSwitchStatus}
          current={activeState}
          onSelect={handleSelectStatus}
          triggerRef={ringRef}
        />

        {/* 顶部标题栏：保留刷新按钮（I3.2 会重构） */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">AI Health Advisor</h1>
            <p className="text-slate-400 text-sm">
              {describeBriefSource(data?.source, t)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => refetchBrief.mutate()}
              disabled={briefIsLoading}
              className="text-xs text-slate-500 h-auto py-1 px-2"
            >
              {refetchBrief.isPending ? t('refreshing') : t('manualRefresh')}
            </Button>
          </div>
        </header>

        {/* Active Sensing 灵动监测 */}
        <ActiveSensingBanner />

        {/* 晨报部分 */}
        <Section title={t('realtimeBrief')} className="space-y-4">
          <MorningBriefCard
            {...briefData}
            isLoading={briefIsLoading}
          />
        </Section>

        {/* 趋势数据已迁移至数据分析页 */}

        <div className="h-20" />
      </div>
    </Container>
  );
}

function describeBriefSource(source: string | undefined, t: (key: string) => string) {
  if (source === 'fallback') {
    return t('sourceFallback');
  }

  if (source === 'llm') {
    return t('sourceLLM');
  }

  return t('sourceLLM');
}

/**
 * 将 API 返回的 AgentStatusColor 映射为 UI 组件期望的 StatusColor。
 * API 使用 'error' 表示红色状态，UI 使用 'alert'。
 */
function mapApiStatusToUi(
  apiStatus?: string,
  finishReason?: string,
): StatusColor {
  if (apiStatus === 'error') return 'alert';
  if (apiStatus === 'warning') return 'warning';
  if (apiStatus === 'good') return 'good';
  // fallback 时显示警告色
  if (finishReason === 'fallback') return 'warning';
  return 'good';
}
