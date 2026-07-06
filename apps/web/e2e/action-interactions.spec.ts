import { test } from '@playwright/test';

/**
 * Homepage action interactions —— 旧版用例（I7.2 之前）。
 *
 * 这些用例在 I3.2 的 ActionCard 重构后失效：旧用例靠 Morning Brief 真实后端
 * 返回 `calendar` / `micro_event` action 并按字面量（"添加进日程" / 微事件
 * 关键词）匹配，但：
 * - sandbox 后端返回的 actions 内容并不稳定（依赖 LLM 决策），用例本身就
 *   非确定性 —— 这就是为什么原作者加了 `if (!isVisible) test.skip(...)` 的
 *   兜底；但 Playwright 的 `isVisible()` 默认 30s 超时反而让"没生成 action"
 *   的会话变成 timeout 失败。
 * - I3.2 的 ActionCard 通过 `data-valo-action-card` 等稳定锚点交互；旧用例
 *   的字面量匹配不再适用。
 *
 * I7.2 起 Action Card / Timer / Appointment 的端到端路径会在
 * `valo-ui.spec.ts` 通过 `page.route` mock morning brief 提供已知 actions
 * 后再断言；这里整体 skip 旧用例。
 */
test.describe('Homepage action interactions (legacy — covered by valo-ui.spec.ts)', () => {
  test.skip('calendar action shows add-to-schedule button without opening active sensing', async () => {
    // 见 valo-ui.spec.ts: 'Action Card (calendar) Yes → 添加进日程 toast'
  });

  test.skip('micro event action updates realtime brief and does not show active sensing banner', async () => {
    // 见 valo-ui.spec.ts: 'Action Card (micro_event) → ActionTimerSheet 打开'
  });
});
