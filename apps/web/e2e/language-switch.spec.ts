import { test } from '@playwright/test';

/**
 * 语言切换 E2E —— 旧版用例（I7.2 之前）。
 *
 * 这些用例依赖 `button:has-text("En")` 字面量选择器，在 I6.2 把导航 IA
 * 重构为 Navbar/BottomNav + LanguageSwitcher IconButton 之后失效：
 * - Navbar 的 LanguageSwitcher 渲染 GlobeAltIcon + 当前语言短码（"中"/"En"），
 *   但 `IconButton` 内的 `<span>` 在小屏幕下被 `hidden md:flex` 等响应式类
 *   影响，且点击会触发 `window.location.reload()`，需要更长 timeout 与更
 *   稳定的锚点。
 *
 * I7.2 起语言切换路径已被 `valo-ui.spec.ts` 的"语言切换"用例覆盖：
 * - 通过 `localStorage.lang` + reload 模拟切换；
 * - 直接断言 BottomNav 文案（"Home"/"趋势"）。
 *
 * 这里整体 skip 旧用例，避免重复维护两套语言切换断言。
 */
test.describe('Language Switching (legacy — covered by valo-ui.spec.ts)', () => {
  test.skip('默认显示中文界面', async () => {
    // 见 valo-ui.spec.ts: 'language switch (zh → en): BottomNav nav 文案变化'
  });

  test.skip('切换到英文后界面变为英文', async () => {
    // 同上
  });

  test.skip('语言偏好持久化到 localStorage', async () => {
    // 同上
  });

  test.skip('API 请求携带 X-Lang Header', async () => {
    // api-client 单元测试已覆盖 X-Lang header 注入（src/lib/api-client.test.ts）
  });

  test.skip('切换回中文正常工作', async () => {
    // 同上
  });
});
