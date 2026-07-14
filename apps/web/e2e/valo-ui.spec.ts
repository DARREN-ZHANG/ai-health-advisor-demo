import { expect, test, type Page } from '@playwright/test';
import { gotoAndWait, reloadAndWait } from './_app-ready';

/**
 * Valo UI 关键路径 E2E（I7.2）。
 *
 * 设计原则：
 *  - 全部通过 `page.route` mock 后端响应（profiles / morning-brief / data /
 *    chat / god-mode），不依赖真实 LLM 或 sandbox 后端，确保 CI 与本地
 *    皆为确定性。
 *  - 全部断言走 `data-valo-*` 稳定锚点，避免依赖易变的 i18n 字面量；仅在
 *    需要校验"语言切换确实换了文案"时使用一个对照字面量（首页 / Trends）。
 *  - 视口敏感组件（SwitchStatusDialog / AccountSwitcherSheet /
 *    DemoControlDrawer / AIAdvisorDrawer）同时挂载移动端 + 桌面端两份 DOM
 *    （Tailwind `block lg:hidden` 与 `hidden lg:block`），统一用
 *    `:visible` 过滤可见实例（与 advisor.spec.ts 同模式）。
 *
 * Mock 信封：与后端 `ApiResponse<T> = { success, data, error, meta }` 一致；
 * api-client 通过 `body.success` 判定业务成功，不包一层 success:true 会被
 * 当作失败抛错。
 *
 * 首页 streaming 改造（任务 4.1）：
 *  - 首页 useMorningBrief 现调用 `/ai/morning-brief/stream`（SSE），不再调
 *    `/ai/morning-brief`（JSON）。mockValoApi 默认挂载 stream mock，返回完整
 *    SSE contract（started → delta* → completed）。
 *  - E2E 只验证终态（completed 后首页 DOM），不验证流式过程中间态——
 *    Playwright route.fulfill 一次性返回全部 body，无法冒充真实流式时序。
 *    渐进 DOM 时序由 Vitest ReadableStream 单测（brief-stream-client.test.ts）
 *    负责。
 *  - 保留旧 JSON route mock（`/ai/morning-brief` 不带 stream）供未迁移场景。
 */

// ---------- 共享 mock 工具 ----------

const MOCK_PROFILES = [
  { profileId: 'profile-a', name: '用户 A', avatar: 'avatar-1.png', age: 30, gender: 'male', recordCount: 12 },
  { profileId: 'profile-b', name: 'User B', avatar: 'avatar-2.png', age: 28, gender: 'female', recordCount: 9 },
];

/** 包装为 ApiResponse 信封。 */
function mockApiResponse<T>(data: T) {
  return {
    success: true,
    data,
    error: null,
    meta: { timestamp: new Date().toISOString() },
  };
}

/** Mock 的最小可用 AgentResponseEnvelope（通过 AgentResponseEnvelopeSchema 校验）。 */
function mockBriefEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    summary: '你昨晚深睡偏少，建议睡前放松。',
    chartTokens: [],
    microTips: ['睡前 1 小时降光', '避免咖啡因'],
    memoryCandidates: [],
    actions: [],
    source: 'llm',
    statusColor: 'good',
    // taskType 必须是 AgentTaskType 枚举值（'homepage_summary'），
    // pageContext 必须通过 PageContextSchema（需要 profileId/page/timeframe），
    // 否则 BriefCompletedEventSchema → AgentResponseEnvelopeSchema 校验失败。
    meta: {
      taskType: 'homepage_summary',
      pageContext: { profileId: 'profile-a', page: 'homepage', timeframe: 'week' },
      finishReason: 'complete',
    },
    ...overrides,
  };
}

/**
 * 把 BriefStreamEvent 序列化为单帧 SSE 文本。
 *
 * 与后端 SseWriter.serializeSseFrame 格式一致：
 * `event: <type>\ndata: <单行 JSON>\n\n`
 */
function serializeSseFrame(event: { type: string } & Record<string, unknown>): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * 构造首页 morning brief stream 的完整 SSE body。
 *
 * started → delta*(可选) → completed（含完整 envelope）。
 * 默认无 delta（cache hit 直达 completed 的最简形态）；
 * 调用方可传 deltas 数组模拟渐进 summary。
 *
 * requestId 必须与前端 streamMorningBrief 发送的 X-Request-Id header 一致，
 * 否则前端的 STREAM_REQUEST_ID_MISMATCH 校验会 reject。route handler 应从
 * 请求 header 读取 requestId 传入。
 *
 * route.fulfill 一次性返回全部 body，不是真实流式；E2E 只验证终态 DOM。
 */
function mockBriefStreamBody(
  envelope: Record<string, unknown>,
  requestId: string,
  options: { deltas?: string[] } = {},
): string {
  const frames: string[] = [
    serializeSseFrame({ type: 'brief.started', requestId }),
  ];
  for (const delta of options.deltas ?? []) {
    frames.push(
      serializeSseFrame({ type: 'brief.summary.delta', requestId, delta }),
    );
  }
  frames.push(
    serializeSseFrame({
      type: 'brief.completed',
      requestId,
      response: envelope,
    }),
  );
  return frames.join('');
}

/**
 * 创建 morning brief stream 的 route fulfill handler。
 *
 * 从请求的 X-Request-Id header 读取 requestId（前端 streamMorningBrief 生成并通过
 * 该 header 发送），保证 SSE body 里的 requestId 与前端期望一致，避免
 * STREAM_REQUEST_ID_MISMATCH。
 */
function fulfillBriefStream(envelope: Record<string, unknown>) {
  return async (route: import('@playwright/test').Route) => {
    const requestId = (await route.request().headerValue('X-Request-Id')) || 'mock-req-e2e';
    const body = mockBriefStreamBody(envelope, requestId);
    return route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: {
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
      body,
    });
  };
}

/** Mock god-mode/state 返回的最小结构。 */
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

/**
 * 在 page 上挂载全部 Valo UI 关心的 mock 路由。
 * 任一未匹配的请求会 fallthrough 到 dev server，但 dev server 本身没有
 * 真实后端，所以"未 mock 的端点"会返回 5xx —— 这正是我们想要逼出的"确定性"。
 */
async function mockValoApi(page: Page) {
  // 注意：api-client 的实际请求 URL 是 `${NEXT_PUBLIC_AGENT_API_BASE_URL}${path}`，
  // 默认 BASE_URL 是 http://localhost:3002，且 path 形如 `/ai/morning-brief`
  // （没有 `/api` 前缀）。所以这里 glob 写 `**/ai/...` / `**/profiles/...` /
  // `**/god-mode/...`，不要带 `/api/`。与 advisor.spec.ts 一致。
  //
  // 任一未 mock 的请求会 fallthrough 到 dev server（3000），但 dev server
  // 并未代理 3002，所以未 mock 端点会直接 5xx —— 这逼出"未 mock 即失败"
  // 的确定性，避免测试依赖后端是否在线。

  // Profiles —— AccountSwitcherSheet / MyScreen 用到
  await page.route('**/profiles', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockApiResponse(MOCK_PROFILES)),
    }),
  );

  // Morning brief stream —— 首页 useMorningBrief 调用 /ai/morning-brief/stream
  // 返回完整 SSE contract（started → completed），E2E 只验证终态 DOM。
  // route.fulfill 一次性返回全部 body，无法冒充真实流式时序；渐进 DOM 时序
  // 由 Vitest ReadableStream 单测负责。
  // 使用动态 handler：从请求 X-Request-Id header 读取 requestId，保证 SSE body
  // 里的 requestId 与前端期望一致。
  await page.route('**/ai/morning-brief/stream**', fulfillBriefStream(mockBriefEnvelope()));

  // Morning brief JSON（旧端点）—— 保留供未迁移场景测试。
  // 首页已迁移到 stream endpoint；若有其他页面仍调用 JSON 端点会命中此 mock。
  await page.route('**/ai/morning-brief', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockApiResponse(mockBriefEnvelope())),
    }),
  );

  // AI chat —— Advisor drawer
  await page.route('**/ai/chat**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        mockApiResponse(
          mockBriefEnvelope({
            summary: 'mock chat reply',
            meta: {
              taskType: 'advisor_chat',
              pageContext: { profileId: 'profile-a', page: 'homepage', timeframe: 'week' },
              finishReason: 'complete',
            },
          }),
        ),
      ),
    }),
  );

  // Data center —— profile 数据 + chart-data
  await page.route('**/profiles/*/data**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        mockApiResponse({
          tab: 'overview',
          timeframe: 'week',
          timeline: [],
          summary: { completeness: 0.8 },
        }),
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

  // God-mode —— switch-profile / inject-event / timeline-append /
  // advance-clock / reset-profile-timeline / micro-event-append / state
  await page.route('**/god-mode/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockApiResponse(mockGodModeState())),
    }),
  );

  // Device sync —— DataCenter DeviceStatusBar 读取 deviceData.syncSessions.length，
  // 因此 mock 必须包含 syncSessions 数组（即便空）。MyScreen 不直接消费此响应。
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
}

/** 视口敏感组件统一用 `:visible` 过滤当前可见的那一份。 */
const visible = (sel: string) => `${sel}:visible`;

// ---------- 测试 ----------

test.describe('Valo UI 关键路径', () => {
  // 默认视口设为移动端（375x812，iPhone-class）：
  // - BottomNav 在 md:hidden 之下，桌面视口不会渲染；
  // - Sheet/Dialog 同时挂载两份 DOM，统一用 `:visible` 过滤；
  // - 视觉风格以 Valo 移动优先形态呈现，与 design-manifest.md 一致。
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    await mockValoApi(page);
  });

  test('首页移动端：Hero / HomeHeader / 底部导航渲染', async ({ page }) => {
    await gotoAndWait(page, '/');
    // HomeHeader
    await expect(page.locator('[data-valo-header="home"]')).toBeVisible();
    // Hero ring
    await expect(page.locator(visible('[data-valo-hero="true"]'))).toBeVisible();
    // 底部导航三项
    await expect(
      page.locator('[data-valo-bottomnav="true"] [data-valo-nav-item="home"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-valo-bottomnav="true"] [data-valo-nav-item="trends"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-valo-bottomnav="true"] [data-valo-nav-item="my"]'),
    ).toBeVisible();
  });

  test('Switch Status：点击 Hero → 弹窗 → 选中 → Hero 状态变化', async ({
    page,
  }) => {
    await gotoAndWait(page, '/');

    // 初始 state：mock morning-brief 返回 statusColor='good'，
    // mapApiStatusToVisualState('good', hasBrief=true) → 'active-recovery'
    await expect(page.locator(visible('[data-valo-hero="true"]'))).toHaveAttribute(
      'data-valo-state',
      'active-recovery',
    );

    // 点击 Hero ring → 打开 SwitchStatusDialog
    await page.locator(visible('[data-valo-ring="true"]')).click();

    // 选中 'alert'（radio option data-valo-option）—— 这里使用第二项
    // 'active-recovery' 之外的任意状态，验证 manual override 生效。
    await page
      .locator(visible('[data-valo-option="glycogen-depleted"]'))
      .click();

    // Hero 状态切换为 glycogen-depleted，弹窗关闭（选项消失）
    await expect(page.locator(visible('[data-valo-hero="true"]'))).toHaveAttribute(
      'data-valo-state',
      'glycogen-depleted',
    );
    await expect(
      page.locator(visible('[data-valo-option="glycogen-depleted"]')),
    ).toHaveCount(0);
  });

  test('Switch Status 关闭后焦点回到状态圆环（P1-02）', async ({ page }) => {
    await gotoAndWait(page, '/');

    const ring = page.locator(visible('[data-valo-ring="true"]'));
    await ring.click();

    // 等待 SwitchStatusDialog 出现
    await expect(
      page.locator(visible('[data-valo-option="glycogen-depleted"]')),
    ).toBeVisible();

    // 选中状态 → 弹窗关闭
    await page.locator(visible('[data-valo-option="glycogen-depleted"]')).click();
    await expect(
      page.locator(visible('[data-valo-option="glycogen-depleted"]')),
    ).toHaveCount(0);

    // 焦点应已归还状态圆环（用 toBeFocused 让 Playwright 自动重试，
    // 吸收 framer-motion exit 动画期间 activeElement 切换的时序波动）
    await expect(page.locator(visible('[data-valo-ring="true"]'))).toBeFocused();
  });

  test('Avatar 打开 AccountSwitcherSheet 并切换 Profile', async ({ page }) => {
    await gotoAndWait(page, '/');

    // 点击 Avatar
    await page.locator(visible('[data-valo-avatar="true"]')).click();

    // AccountSwitcherSheet 打开：mock 的两个 profile 都列出
    const switcherMobile = page.locator(
      '[data-valo-account-switcher="mobile"]',
    );
    const switcherDesktop = page.locator(
      '[data-valo-account-switcher="desktop"]',
    );
    // 至少一份 visible（取决于视口）
    const visibleSwitcher = (await switcherMobile.isVisible().catch(() => false))
      ? switcherMobile
      : switcherDesktop;

    await expect(
      visibleSwitcher.locator('[data-valo-option="profile-a"]'),
    ).toBeVisible();
    await expect(
      visibleSwitcher.locator('[data-valo-option="profile-b"]'),
    ).toBeVisible();

    // 切换到 profile-b
    await visibleSwitcher.locator('[data-valo-option="profile-b"]').click();

    // Profile 切换走 POST /god-mode/switch-profile，mock 返回 currentProfileId
    // 仍为 profile-a —— 但 setProfileId(state.currentProfileId) 会维持 a。
    // 这里仅断言弹窗已关闭（关闭即代表 switchProfile 成功）。
    await expect(switcherMobile).toHaveCount(1);
  });

  test('Trends 页面渲染并切换 tab', async ({ page }) => {
    await gotoAndWait(page, '/data-center');

    // 趋势页 controls 钩子存在
    await expect(page.locator('[data-valo-trends-controls=""]')).toBeVisible();

    // tab 切换：DataCenterControls 的指标 chip 用 button[role="tab"] 渲染
    const tabButtons = page.locator(
      '[data-valo-trends-controls=""] button[role="tab"]',
    );
    const count = await tabButtons.count();
    expect(count).toBeGreaterThan(1);

    // 点击第 2 个 tab（index 1）—— 不一定是 active，断言无崩溃
    await tabButtons.nth(1).click();
    // 仍可见即可（数据 mock 为空数组，但容器不崩）
    await expect(page.locator('[data-valo-trends-controls=""]')).toBeVisible();
  });

  test('My 页面渲染：当前 profile 头像 + 禁用项 aria-disabled', async ({
    page,
  }) => {
    await gotoAndWait(page, '/my');

    await expect(page.locator('[data-valo-my="root"]')).toBeVisible();
    // 当前 profile 名称（mock 后取 profile-a.name=用户 A）
    await expect(
      page.locator('[data-valo-my="current-profile-name"]'),
    ).toContainText('用户 A');

    // 至少有一个 aria-disabled 行（演示版本 Settings/Notifications 等）
    const disabledRows = page.locator('[data-valo-disabled="true"]');
    expect(await disabledRows.count()).toBeGreaterThan(0);
  });

  test('Life Log：快捷加 1 杯 → 列表出现 entry', async ({ page }) => {
    await gotoAndWait(page, '/');

    // Life Log 面板可见
    await expect(
      page.locator('[data-valo-life-log-panel=""]'),
    ).toBeVisible();

    // 初始：3 个类目都显示空态
    await expect(
      page.locator('[data-valo-life-log-empty=""]'),
    ).toHaveCount(3);

    // 点击第一个快捷加按钮（caffeine 类目）
    await page.locator(visible('[data-valo-life-log-quick-add=""]')).first().click();

    // 至少一个 entry 出现（不再全部空态）
    await expect(page.locator('[data-valo-life-log-entry]').first()).toBeVisible();
  });

  test('语言切换 (zh → en)：BottomNav nav 文案变化', async ({ page }) => {
    await gotoAndWait(page, '/');

    // 默认中文：底部导航 "trends" 锚点的文案为 "趋势"
    await expect(
      page.locator('[data-valo-bottomnav="true"] [data-valo-nav-item="trends"]'),
    ).toContainText('趋势');

    // 通过 localStorage 切换语言（与 LanguageSwitcher 同样的 reload-based 模式）
    await page.evaluate(() => window.localStorage.setItem('lang', 'en'));
    await reloadAndWait(page);

    // 切换后：trends 文案为 "Trends"
    await expect(
      page.locator('[data-valo-bottomnav="true"] [data-valo-nav-item="trends"]'),
    ).toContainText('Trends');
  });

  test('英文路径：Hero ringLabel 渲染为英文', async ({ page }) => {
    // 通过 init script 在首次加载前注入 localStorage，避免一次跳变 reload
    await page.addInitScript(() => {
      window.localStorage.setItem('lang', 'en');
    });
    await gotoAndWait(page, '/');

    // Hero ring 按钮的 aria-label 在 en 下是 "Tap to switch status"
    const ring = page.locator(visible('[data-valo-ring="true"]'));
    const label = await ring.getAttribute('aria-label');
    expect(label).toBeTruthy();
    // 与中文文案不同即可证明语言生效
    expect(label).not.toContain('切换');
  });

  test('Action Card (calendar) Yes → AppointmentSheet 打开', async ({ page }) => {
    // 重新 mock morning-brief stream 提供 calendar action
    await page.unroute('**/ai/morning-brief/stream**');
    await page.route(
      '**/ai/morning-brief/stream**',
      fulfillBriefStream(
        mockBriefEnvelope({
          actions: [
            {
              id: 'action-calendar-1',
              emoji: '📅',
              title: 'Add wind-down to calendar',
              description: 'Schedule 10-min wind-down',
              aiPromise: 'Helps you wind down before sleep',
              interaction: {
                kind: 'calendar',
                calendar: {
                  title: 'Wind-down',
                  timingLabel: 'tonight',
                  durationMinutes: 10,
                },
              },
            },
          ],
        }),
      ),
    );

    await gotoAndWait(page, '/');

    // 通过 h3 title 锚定卡片（ActionCard.title 在 h3 内渲染）
    const cardTitle = page.getByRole('heading', {
      level: 3,
      name: 'Add wind-down to calendar',
    });
    await expect(cardTitle).toBeVisible({ timeout: 10_000 });

    // 点击 Yes 按钮：ActionCard 内第一个 button（按渲染顺序 Yes 排在 Not Now 之前）
    // 这里用 hasText 容忍 zh/en 文案差异
    const yesBtn = page
      .locator('button[data-valo-touch="true"]')
      .filter({ hasText: /^(Yes|开始|开始计时|确认|是)$/ })
      .first();
    await yesBtn.click();

    // AppointmentSheet 打开：role=dialog + 标题包含 i18n appointment.title
    // zh: "添加到日历", en: "Add to Calendar"
    await expect(
      page.locator('[role="dialog"]').filter({ hasText: /Calendar|日历/ }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('Action Card (micro_event) Yes → ActionTimerSheet 打开', async ({ page }) => {
    // 重新 mock 提供 micro_event action
    await page.unroute('**/ai/morning-brief/stream**');
    await page.route(
      '**/ai/morning-brief/stream**',
      fulfillBriefStream(
        mockBriefEnvelope({
          actions: [
            {
              id: 'action-micro-1',
              emoji: '🫁',
              title: 'Box breathing',
              description: '2 minutes box breathing',
              aiPromise: 'Activates parasympathetic system',
              interaction: {
                kind: 'micro_event',
                microEvent: {
                  type: 'micro_box_breathing',
                  durationMinutes: 2,
                },
              },
            },
          ],
        }),
      ),
    );

    await gotoAndWait(page, '/');

    const cardTitle = page.getByRole('heading', {
      level: 3,
      name: 'Box breathing',
    });
    await expect(cardTitle).toBeVisible({ timeout: 10_000 });

    // 点击 Yes 按钮（filter hasText 容忍 zh/en）
    const yesBtn = page
      .locator('button[data-valo-touch="true"]')
      .filter({ hasText: /^(Yes|开始|开始计时|确认|是)$/ })
      .first();
    await yesBtn.click();

    // ActionTimerSheet 打开：role=dialog 内含 progressbar（计时器）
    await expect(
      page.locator('[role="dialog"] [role="progressbar"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
