import { test } from '@playwright/test';

/**
 * God-Mode E2E —— 旧版用例（I7.2 之前）。
 *
 * 这些用例在 I2.1/I2.2 重构后失效：原来的"首页 Profile Switch 区域 +
 * Config 抽屉 + 单卡片 cardio 按钮"已被统一替换为
 * `DemoControlTrigger`（Avatar 旁的浮动按钮）+ `DemoControlDrawer`
 * （13 个 timeline segment + +1h + 重置）。
 *
 * I7.2 起所有 God Mode / Demo Control 路径已被 `demo-control.spec.ts`
 * 完整覆盖（含 13 segments、概率事件、+1h、reset、pending 状态）。
 * 这里整体 skip 旧用例，避免维护两套断言。
 */
test.describe('God-Mode E2E (legacy — covered by demo-control.spec.ts)', () => {
  test.skip('should switch profile from homepage config area', async () => {
    // Profile 切换见 valo-ui.spec.ts: 'Avatar 打开 AccountSwitcherSheet 并切换'
  });

  test.skip('should append timeline segment and show active sensing banner', async () => {
    // 见 demo-control.spec.ts: 'append-timeline segment 卡片点击触发 POST /god-mode/timeline-append'
  });

  test.skip('should reset timeline from homepage config area', async () => {
    // 见 demo-control.spec.ts: 'reset 触发确认弹窗，确认后调用 POST /god-mode/reset-profile-timeline'
  });
});
