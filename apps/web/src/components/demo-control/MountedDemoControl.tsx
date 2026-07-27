'use client';

/**
 * Demo Control 抽屉的客户端 wrapper（I2.3 起，I3.1 调整）。
 *
 * 历史：I2.2/I2.3 期间 Trigger + Drawer 一起挂在 `app/layout.tsx` 浮层。
 * I3.1 把 Trigger 迁回 HomeHeader（设计稿位置：Avatar 旁），本组件现在
 * 只挂载 Drawer（依然需要全局可达，让 HomeHeader 内的 Trigger 通过
 * `useGodModeStore.toggleOpen` 跨组件控制开合）。
 *
 * 调用方：仍在 `app/layout.tsx` 挂载一份（位置不再重要，因为本组件不再
 * 渲染任何可见入口），保证 Drawer 在任何页面都能被 HomeHeader 触发。
 * 如果未来 HomeHeader 也成为全局 layout 的一部分，可以把 Drawer 直接
 * 挪到 HomeHeader，移除本 wrapper。
 */
import { useEffect } from 'react';
import { useDemoControlActions } from '@/hooks/use-demo-control-actions';
import { useCurrentPlan } from '@/hooks/use-plan-query';
import { useGodModeStore } from '@/stores/god-mode.store';
import { useProfileStore } from '@/stores/profile.store';
import { DemoControlDrawer } from './DemoControlDrawer';

export function MountedDemoControl() {
  const { onSegmentClick, onResetTimeline, isResettingTimeline } = useDemoControlActions();
  const currentProfileId = useProfileStore((state) => state.currentProfileId);
  const { data: plan } = useCurrentPlan(currentProfileId ?? undefined);
  const setSelectedPlanDayIndex = useGodModeStore((state) => state.setSelectedPlanDayIndex);

  useEffect(() => {
    setSelectedPlanDayIndex(0);
  }, [plan?.id, setSelectedPlanDayIndex]);

  return (
    <DemoControlDrawer
      onSegmentClick={onSegmentClick}
      onResetTimeline={onResetTimeline}
      isResettingTimeline={isResettingTimeline}
      planDays={plan?.groups.map((group) => ({ id: group.id, title: group.title })) ?? []}
    />
  );
}
