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
import { useDemoControlActions } from '@/hooks/use-demo-control-actions';
import { DemoControlDrawer } from './DemoControlDrawer';

export function MountedDemoControl() {
  const { onSegmentClick, onAdvanceHour, onReset } = useDemoControlActions();
  return (
    <DemoControlDrawer
      onSegmentClick={onSegmentClick}
      onAdvanceHour={onAdvanceHour}
      onReset={onReset}
    />
  );
}
