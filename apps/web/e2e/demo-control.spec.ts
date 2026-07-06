import { expect, test, type Page } from '@playwright/test';

/**
 * Demo Control（Timeline Control）E2E（I7.2）。
 *
 * 前置条件：`NEXT_PUBLIC_ENABLE_GOD_MODE=true`，让 useGodModeStore.isEnabled
 * 为 true，DemoControlTrigger / DemoControlDrawer 渲染。
 * playwright.config.ts 默认不覆盖该 env，env.ts 的 zod 默认值即 'true'，
 * 所以无需在测试内额外注入。
 *
 * 全部走 page.route mock；不依赖真实 god-mode 后端 / sandbox。
 * 视口敏感的 DemoControlDrawer 同时挂载移动端 ValoSheet 与桌面端 ValoDialog，
 * 统一用 `:visible` 过滤当前可见实例（与 advisor.spec.ts 同模式）。
 */

// ---------- 共享 mock 工具 ----------

/** 包装为 ApiResponse 信封。 */
function mockApiResponse<T>(data: T) {
  return {
    success: true,
    data,
    error: null,
    meta: { timestamp: new Date().toISOString() },
  };
}

/** Mock 的最小 GodModeStateResponse。 */
function mockGodModeState(overrides: Record<string, unknown> = {}) {
  return {
    currentProfileId: 'profile-a',
    timeline: [],
    recentRecognizedEvents: [],
    activeSensing: null,
    currentDemoTime: '2026-06-21T08:00:00.000Z',
    ...overrides,
  };
}

/** Mock 的最小 AgentResponseEnvelope。 */
function mockBriefEnvelope() {
  return {
    summary: 'mock brief',
    chartTokens: [],
    microTips: [],
    memoryCandidates: [],
    actions: [],
    source: 'llm',
    statusColor: 'good',
    meta: { taskType: 'morning-brief', pageContext: {}, finishReason: 'stop' },
  };
}

/**
 * 挂载 demo-control 关心的全部 mock 路由：
 * - profiles / morning-brief / data（让首页能正常渲染）
 * - god-mode/* —— mutation 端点都返回 success envelope
 *
 * 测试通过 `page.waitForRequest(...)` 直接监听 mutation 是否真的发出，
 * 因此 mock 路由本身只需 fulfill；不在此处做计数。
 */
async function mockDemoControlApi(page: Page) {
  await page.route('**/profiles', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        mockApiResponse([
          {
            profileId: 'profile-a',
            name: '用户 A',
            age: 30,
            gender: 'male',
            recordCount: 12,
          },
        ]),
      ),
    }),
  );
  await page.route('**/ai/morning-brief**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockApiResponse(mockBriefEnvelope())),
    }),
  );
  await page.route('**/profiles/*/data**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        mockApiResponse({ timeline: [], summary: { completeness: 0.8 } }),
      ),
    }),
  );
  await page.route('**/profiles/*/chart-data**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockApiResponse([])),
    }),
  );
  await page.route('**/profiles/*/device-sync**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        mockApiResponse({
          profileId: 'profile-a',
          samplingIntervalMinutes: null,
          totalDeviceSamples: 0,
          pendingDeviceSamples: 0,
          firstDeviceSampleAt: null,
          lastDeviceSampleAt: null,
          lastSyncedSampleAt: null,
          syncSessions: [],
        }),
      ),
    }),
  );

  // god-mode 全部端点统一返回最小 mock state。
  await page.route('**/god-mode/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockApiResponse(mockGodModeState())),
    }),
  );
}

/** 视口敏感组件统一 `:visible`。 */
const visible = (sel: string) => `${sel}:visible`;

/** 打开 DemoControlDrawer（点击 Avatar 旁的 Trigger）。 */
async function openDrawer(page: Page) {
  // DemoControlTrigger 在首页 HomeHeader 渲染，aria-label 走 i18n（openTrigger）
  await page.locator('[aria-haspopup="dialog"][aria-controls="demo-control-drawer"]').click();
  // drawer 内容渲染（data-valo-clock 是 SummaryArea 内的稳定锚点）
  await expect(page.locator(visible('[data-valo-clock="true"]'))).toBeVisible();
}

// ---------- 测试 ----------

test.describe('Demo Control', () => {
  // 移动端视口：BottomNav 渲染、DemoControlDrawer 走 ValoSheet bottom-sheet
  // 路径（与 advisor.spec.ts / valo-ui.spec.ts 一致）。drawer 同时挂载
  // 移动端 + 桌面端两份 DOM，所有断言统一用 `:visible` scope 到当前可见实例。
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    await mockDemoControlApi(page);
    await page.goto('/');
  });

  test('Trigger 在 God Mode 启用时可见', async ({ page }) => {
    // aria-controls="demo-control-drawer" 锚点命中 DemoControlTrigger
    await expect(
      page.locator('[aria-haspopup="dialog"][aria-controls="demo-control-drawer"]'),
    ).toBeVisible();
  });

  test('点击 Trigger 打开抽屉，显示标题 + LIVE + 关闭按钮', async ({ page }) => {
    await openDrawer(page);

    // drawer 头部 LIVE 标识：LivePill 渲染为 `<span>`，文字即 'LIVE'
    // （中英同字面量）。dual-DOM 下两份都有；用 .filter({ visible }) 取可见实例。
    // 直接断言可见元素计数 >= 1。
    const livePills = page.getByText('LIVE', { exact: true });
    await expect(livePills.filter({ visible: true })).toHaveCount(1);
  });

  test('13 segments 分 3 组渲染（6 / 3 / 4）', async ({ page }) => {
    await openDrawer(page);

    // 三组容器（visible scope 到当前可见的副本）
    const daily = page.locator(visible('[data-valo-group="daily-rhythm"]'));
    const sport = page.locator(visible('[data-valo-group="sport-training"]'));
    const state = page.locator(visible('[data-valo-group="state-intake"]'));

    // 每个 segment 渲染为「主卡片 button + 帮助 button」两个 `[data-valo-touch]`。
    // 帮助 button 有 aria-label（"帮助"/"Help"），主 button 没有 aria-label。
    // 用 `:not([aria-label])` 选中主 button。
    // 注意：组容器本身就是 `<section>`，所以从 group 直接找 button 后代，
    // 不要再嵌套 'section button'（那要求 group 内还有 `<section>`）。
    const mainBtn = (group: ReturnType<Page['locator']>) =>
      group.locator('button[data-valo-touch="true"]:not([aria-label])');

    await expect(mainBtn(daily)).toHaveCount(6);
    await expect(mainBtn(sport)).toHaveCount(3);
    await expect(mainBtn(state)).toHaveCount(4);
  });

  test('+1h 点击触发 POST /god-mode/advance-clock', async ({ page }) => {
    await openDrawer(page);

    // 监听 advance-clock 请求
    const advanceRequest = page.waitForRequest(
      (req) =>
        req.method() === 'POST' && req.url().includes('/god-mode/advance-clock'),
      { timeout: 10_000 },
    );

    // 点击 +1h（drawer footer 内 +1h 文案 button，中英同字面量）。
    // footer 在 dual-DOM 两份都有，统一 `:visible` scope。
    const footerAdvance = page.locator(
      'footer button[data-valo-touch="true"]:visible',
      { hasText: '+1h' },
    );
    await footerAdvance.click();

    const req = await advanceRequest;
    expect(req).toBeTruthy();
    const body = req.postDataJSON();
    expect(body.minutes).toBe(60);
  });

  test('reset 点击 → 确认弹窗 → 确认触发 POST /god-mode/reset-profile-timeline', async ({
    page,
  }) => {
    await openDrawer(page);

    // 监听 reset 请求
    const resetRequest = page.waitForRequest(
      (req) =>
        req.method() === 'POST' &&
        req.url().includes('/god-mode/reset-profile-timeline'),
      { timeout: 10_000 },
    );

    // 点击 reset（footer 内重置按钮，i18n: zh"重置" / en"Reset"）
    const resetBtn = page.locator(
      'footer button[data-valo-touch="true"]:visible',
      { hasText: /^(Reset|重置)$/ },
    );
    await resetBtn.click();

    // 确认弹窗（TimelineResetDialog → ValoConfirmDialog）：
    // 标题文案 zh"重置时间轴？" / en"Reset Timeline?"，aria-label 同。
    // confirm 按钮文案 = resetConfirmAction（zh"重置" / en"Reset"）。
    // 通过弹窗的 aria-label scope 到该 confirm dialog，再找其内 button。
    const resetDialog = page.getByRole('dialog', {
      name: /重置时间轴|Reset Timeline/,
    });
    await expect(resetDialog).toBeVisible();
    const confirmBtn = resetDialog.locator('button', {
      hasText: /^(重置|Reset)$/,
    }).last();
    await confirmBtn.click();

    const req = await resetRequest;
    expect(req).toBeTruthy();
    const body = req.postDataJSON();
    expect(body.profileId).toBe('profile-a');
  });

  test('概率片段 (caffeine) → POST /god-mode/inject-event', async ({ page }) => {
    await openDrawer(page);

    // 监听 inject-event
    const injectRequest = page.waitForRequest(
      (req) =>
        req.method() === 'POST' && req.url().includes('/god-mode/inject-event'),
      { timeout: 10_000 },
    );

    // state-intake 组下的 caffeine 主卡片：图标 ☕ + 文案"咖啡因/Caffeine"。
    // 用 :not([aria-label]) 排除帮助按钮；hasText 不分语言匹配 emoji。
    const stateGroup = page.locator(visible('[data-valo-group="state-intake"]'));
    const caffeineCard = stateGroup.locator(
      'button[data-valo-touch="true"]:not([aria-label])',
      { hasText: '☕' },
    );
    await caffeineCard.click();

    const req = await injectRequest;
    expect(req).toBeTruthy();
    const body = req.postDataJSON();
    expect(body.eventType).toBe('possible_caffeine_intake');
  });

  test('普通片段 (sleep) → POST /god-mode/timeline-append', async ({ page }) => {
    await openDrawer(page);

    // 监听 timeline-append
    const appendRequest = page.waitForRequest(
      (req) =>
        req.method() === 'POST' && req.url().includes('/god-mode/timeline-append'),
      { timeout: 10_000 },
    );

    // daily-rhythm 组下 sleep 卡片（😴）
    const dailyGroup = page.locator(visible('[data-valo-group="daily-rhythm"]'));
    const sleepCard = dailyGroup.locator(
      'button[data-valo-touch="true"]:not([aria-label])',
      { hasText: '😴' },
    );
    await sleepCard.click();

    const req = await appendRequest;
    expect(req).toBeTruthy();
    const body = req.postDataJSON();
    expect(body.segmentType).toBe('sleep');
  });

  test('关闭按钮：抽屉可被关闭', async ({ page }) => {
    await openDrawer(page);

    // drawer 内 close 按钮：在可见的 dialog 内、aria-label 关闭/Close。
    const closeBtn = page.locator(
      '[role="dialog"]:visible button[aria-label="关闭"], [role="dialog"]:visible button[aria-label="Close"]',
    );
    await closeBtn.click();

    // 抽屉消失：data-valo-clock 不再可见
    await expect(page.locator(visible('[data-valo-clock="true"]'))).toHaveCount(0);
  });
});
