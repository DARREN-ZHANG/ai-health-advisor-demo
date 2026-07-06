import { expect, type Page } from '@playwright/test';

/**
 * E2E 共享：等待 app 完成客户端 hydration。
 *
 * 背景（详见 providers.tsx）：
 *  - `Providers` 在客户端通过动态 `import('../messages/${locale}.json')`
 *    加载 i18n 字典，加载完成前 `messages` 为 undefined，组件 `return null`。
 *  - SSR / 首屏因此触发 Next.js 路由级 Suspense，回退到 `loading.tsx` 骨架
 *    （`animate-pulse` 占位），整棵 layout（含 AppShell / BottomNav /
 *    AIAdvisorTrigger）都不会出现在首屏 HTML 中。
 *  - Playwright `page.goto('/')` 在 HTML 加载完成即返回，但此时 React
 *    尚未 hydrate、字典尚未异步加载，断言任何 UI 元素都会因默认 5s timeout
 *    失败。
 *
 * 等待策略：
 *  - `AIAdvisorTrigger` 在 `layout.tsx → AppShell.floating` 内，受 Providers
 *    包裹，且在所有路由（首页 / data-center / my）都全局挂载；
 *    它不依赖视口断点（与 BottomNav 的 `md:hidden` 不同），在桌面/移动端
 *    均可见，是更稳定的 app-ready 锚点。
 *  - 它可见即可证明 Providers 已完成 messages 加载、整棵 layout 已 hydrate，
 *    所有 page-scoped 子组件也已具备渲染前提。
 *  - 测试过程中若需要打开 advisor drawer（trigger 会 `return null`），调用方
 *    应在 `gotoAndWait` 之后才打开 drawer，避免 race。
 *
 * 使用：
 *  - `gotoAndWait(page, '/')`：替代裸 `page.goto(url)`，导航后等待 app ready。
 *  - `waitForAppReady(page)`：在已有 `page.reload()` 之后单独调用。
 */
export async function waitForAppReady(page: Page): Promise<void> {
  // 默认 30s 在并发跑（fullyParallel）+ dev server 冷编译时偶发超时；
  // 60s 仍能区分"app ready"与"app 真的坏了"，留足编译裕量。
  await expect(
    page.locator('[data-valo-advisor-trigger="true"]'),
  ).toBeVisible({ timeout: 60_000 });
}

/** 导航到 url 后等待 app 完成客户端 hydration。 */
export async function gotoAndWait(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await waitForAppReady(page);
}

/** 重载当前页后等待 app 完成客户端 hydration。 */
export async function reloadAndWait(page: Page): Promise<void> {
  await page.reload();
  await waitForAppReady(page);
}
