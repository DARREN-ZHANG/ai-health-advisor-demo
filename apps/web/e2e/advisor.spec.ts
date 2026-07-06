import { expect, test, type Page } from '@playwright/test';

/**
 * AI Advisor E2E —— Valo 视觉 + 稳定 data 锚点（I5.2）。
 *
 * 旧版用例依赖 i18n 字面量（"AI Health Advisor"、"问我点什么..."、Clear Chat），
 * 在 I5.1 之后已失效。I5.2 改造为：
 *  - 全部使用 `data-valo-advisor-*` / `data-valo-message-*` 稳定锚点。
 *  - 用 Playwright `page.route` mock 掉 `/ai/chat`（chat 端点）与 `/ai/morning-brief`
 *    （首页加载时请求），避免依赖真实后端，使 e2e 在 CI / 本地都确定性运行。
 *  - 默认中文 locale（app 默认 `lang="zh-CN"`，无路由前缀）。
 */

/** Mock 的最小可用 AgentResponseEnvelope。 */
function mockEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    summary: '你昨晚深睡偏少，建议睡前放松。',
    chartTokens: [],
    microTips: [],
    memoryCandidates: [],
    source: 'llm',
    statusColor: 'good',
    meta: { taskType: 'chat', pageContext: {}, finishReason: 'stop' },
    ...overrides,
  };
}

/**
 * 包装成后端的 ApiResponse 信封：`{ success, data, error, meta }`。
 * api-client 通过 `body.success` 判定业务成功；不包一层会被当作失败。
 */
function mockApiResponse(envelope: Record<string, unknown>) {
  return {
    success: true,
    data: envelope,
    error: null,
    meta: { timestamp: new Date().toISOString() },
  };
}

/** 在 page 上挂载 chat / morning-brief 的 mock 路由。 */
async function mockAdvisorApi(
  page: Page,
  options: {
    chatStatus?: number;
    chatBody?: unknown;
    chatDelayMs?: number;
  } = {},
) {
  const { chatStatus = 200, chatBody, chatDelayMs = 0 } = options;

  await page.route('**/ai/chat**', async (route) => {
    if (chatDelayMs > 0) {
      await new Promise((r) => setTimeout(r, chatDelayMs));
    }
    if (chatStatus >= 400) {
      await route.fulfill({
        status: chatStatus,
        contentType: 'application/json',
        body: JSON.stringify(
          chatBody ?? { error: 'mock chat failure', message: 'network down' },
        ),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockApiResponse(chatBody ?? mockEnvelope())),
    });
  });

  // 首页加载会触发 morning-brief；统一 mock 成最小 envelope，避免 5xx 拖慢用例。
  await page.route('**/ai/morning-brief**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        mockApiResponse(mockEnvelope({ summary: '今日概览（mock）' })),
      ),
    });
  });
}

test.describe('AI Advisor E2E', () => {
  test.beforeEach(async ({ page }) => {
    await mockAdvisorApi(page);
    await page.goto('/');
  });

  // Drawer 在移动端 (block lg:hidden) 与桌面端 (hidden lg:block) 两层 DOM
  // 同时挂载。统一用 `:visible` 过滤出当前视口实际可见的那一份。
  const visible = (sel: string) => `${sel}:visible`;

  /** 等待 trigger 可见并打开 Drawer。 */
  async function openDrawer(page: Page) {
    await page.locator(visible('[data-valo-advisor-trigger="true"]')).click();
    await expect(
      page.locator(visible('[data-valo-advisor-title="true"]')),
    ).toBeVisible();
  }

  test('should open advisor drawer, send a message, and see assistant reply', async ({
    page,
  }) => {
    // 1. 点击 AI 顾问入口（data 锚点）
    await openDrawer(page);

    // 2. 在 composer 输入并回车发送
    const composer = page.locator(visible('[data-valo-advisor-composer="true"]'));
    await composer.fill('帮我分析一下最近的睡眠');
    await page.keyboard.press('Enter');

    // 3. 用户消息立即出现在列表（data-valo-message-role="user"）
    await expect(
      page.locator(visible('[data-valo-message-role="user"]')),
    ).toBeVisible();

    // 4. Assistant 消息随后出现（mock envelope.summary）
    await expect(
      page
        .locator(visible('[data-valo-message-role="assistant"]'))
        .filter({ hasText: '你昨晚深睡偏少' }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('should show loading indicator while waiting for assistant reply', async ({
    page,
  }) => {
    await mockAdvisorApi(page, { chatDelayMs: 800 });
    await page.reload();

    await openDrawer(page);
    await page
      .locator(visible('[data-valo-advisor-composer="true"]'))
      .fill('hello');
    await page.locator(visible('[data-valo-advisor-send="true"]')).click();

    // loading 指示器可见（在 mock 800ms 延迟内）
    await expect(
      page.locator(visible('[data-valo-advisor-loading="true"]')),
    ).toBeVisible();
  });

  test('should render system error message when chat API fails', async ({ page }) => {
    // 重新 mock chat 端点为 500
    await page.unroute('**/ai/chat**');
    await page.route('**/ai/chat**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'mock 500' }),
      });
    });

    await openDrawer(page);
    await page
      .locator(visible('[data-valo-advisor-composer="true"]'))
      .fill('trigger failure');
    await page.locator(visible('[data-valo-advisor-send="true"]')).click();

    // system 错误消息出现（drawer catch 分支写入 system 消息）
    await expect(
      page.locator(visible('[data-valo-message-role="system"]')),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('should clear chat history via MoreMenu', async ({ page }) => {
    await openDrawer(page);
    await page
      .locator(visible('[data-valo-advisor-composer="true"]'))
      .fill('clear test message');
    await page.locator(visible('[data-valo-advisor-send="true"]')).click();

    // 用户消息已渲染
    await expect(
      page.locator(visible('[data-valo-message-role="user"]')),
    ).toBeVisible();

    // 自动接受 window.confirm
    page.once('dialog', (dialog) => dialog.accept());

    // 展开更多菜单并点击"清空对话"
    await page.getByRole('button', { name: '更多选项' }).click();
    await page.locator(visible('[data-valo-advisor-clear="true"]')).click();

    // 消息列表清空：user 消息消失
    await expect(
      page.locator('[data-valo-message-role="user"]'),
    ).toHaveCount(0);
    // empty state 标题重新可见
    await expect(
      page.locator(visible('[data-valo-empty-state="true"]')),
    ).toBeVisible();
  });

  // Profile 切换 e2e 依赖 I6.1 的真实 Profile Switch UI；在该模块落地前先 skip。
  test.skip('should refresh physio tags after profile switch (depends on I6.1)', async () => {
    // TODO(I6.1): Profile Switch sheet 落地后补全：
    //   1. 打开 Profile Switch
    //   2. 切换到 Profile B
    //   3. 断言 [data-valo-physio-tag="profile"] 文案变化
  });
});
