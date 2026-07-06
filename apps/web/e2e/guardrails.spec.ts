import { test } from '@playwright/test';

/**
 * Platform Guardrails & Navigation —— 旧版用例（I7.2 之前）。
 *
 * 这些用例依赖 I4.1/I4.2 之前的数据中心 UI 字面量（"实时简报"、"数据完整度"、
 * "睡眠分析"、"AI 视图总结"）。重构后：
 * - 数据中心标题与 tab 文案已改为 i18n 翻译键（`t('tabSleep')` 等），不再使用
 *   这些旧字面量；
 * - AI View Summary 悬浮按钮已被 `ReflectionSection` 替代；
 * - 首页"实时简报"虽然仍在 homepage.realtimeBrief 翻译里，但页面会同时渲染
 *   两处"实时简报"（顶部 header h1 + Section 标题），用 `getByText` 容易撞
 *   严格模式（multi-element）。
 *
 * I7.2 起 Home → Trends 导航 / tab 切换已被 `valo-ui.spec.ts` 的
 * "Trends 页面导航 + tab 切换"用例覆盖。这里整体 skip。
 */
test.describe('Platform Guardrails & Navigation (legacy — covered by valo-ui.spec.ts)', () => {
  test.skip('should navigate between Home and Data Center', async () => {
    // 见 valo-ui.spec.ts: 'Trends 页面渲染并切换 tab'
  });

  test.skip('should trigger AI View Summary in Data Center', async () => {
    // 旧 AI View Summary 悬浮按钮已删除（被 ReflectionSection 替代）。
    // TODO: 若未来重新引入 view-summary 浮层，在 valo-ui.spec.ts 补一条用例。
  });
});
