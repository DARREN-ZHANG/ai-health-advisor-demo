'use client';

/**
 * Demo Control 入口与抽屉的客户端 wrapper（I2.3）。
 *
 * `app/layout.tsx` 是 Server Component，无法直接调用 hook；本组件把
 * Trigger + Drawer + `useDemoControlActions` 组合到一起，作为 client
 * island 挂在 server layout 中。I6.1 把入口迁到 HomeHeader 时，可以把
 * 该组件（含 trigger + drawer + actions hook）整体搬走。
 */
import { useDemoControlActions } from '@/hooks/use-demo-control-actions';
import { DemoControlTrigger } from './DemoControlTrigger';
import { DemoControlDrawer } from './DemoControlDrawer';

export function MountedDemoControl() {
  const { onSegmentClick, onAdvanceHour, onReset } = useDemoControlActions();
  return (
    <>
      <DemoControlTrigger />
      <DemoControlDrawer
        onSegmentClick={onSegmentClick}
        onAdvanceHour={onAdvanceHour}
        onReset={onReset}
      />
    </>
  );
}
