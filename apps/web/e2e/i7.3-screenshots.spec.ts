import path from 'node:path';
import { test, type Page } from '@playwright/test';
import { gotoAndWait } from './_app-ready';

/**
 * 截图输出根目录。
 *
 * Playwright 的 cwd 是 apps/web，但证据需要落到仓库根的 docs/ui/valo/qa/i7.3/。
 * 用 __dirname 计算（__dirname 永远是 apps/web/e2e，往上三层到仓库根），
 * 避免"相对 cwd"在不同启动方式下指向不一致。
 */
const SCREENSHOTS_DIR = path.resolve(
  __dirname,
  '../../../docs/ui/valo/qa/i7.3',
);

/**
 * I7.3 视觉验收截图生成器。
 *
 * 复用 valo-ui.spec.ts / demo-control.spec.ts 的 mock 模式，在四视口下
 * 对关键场景做整页截图，输出到 docs/ui/valo/qa/i7.3/。
 *
 * 运行：pnpm --filter web exec playwright test e2e/i7.3-screenshots.spec.ts
 *
 * 注意：本 spec 不做行为断言，只做截图生成。失败容忍度高（dev server
 * 慢、视图未渲染完等），可单独重跑。
 */

// ---------- 共享 mock 工具（与 valo-ui.spec.ts 保持一致） ----------

const MOCK_PROFILES = [
  { profileId: 'profile-a', name: '用户 A', avatar: 'avatar-1.png', age: 30, gender: 'male', recordCount: 12 },
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

/** Mock 的最小可用 AgentResponseEnvelope。 */
function mockBriefEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    summary: '你昨晚深睡偏少，建议睡前放松。',
    chartTokens: [],
    microTips: ['睡前 1 小时降光', '避免咖啡因'],
    memoryCandidates: [],
    actions: [],
    source: 'llm',
    statusColor: 'good',
    meta: { taskType: 'morning-brief', pageContext: {}, finishReason: 'stop' },
    ...overrides,
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
 * 与 valo-ui.spec.ts 同款，确保消费方拿到确定性响应。
 */
async function mockValoApi(page: Page) {
  await page.route('**/profiles', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockApiResponse(MOCK_PROFILES)),
    }),
  );
  await page.route('**/ai/morning-brief**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockApiResponse(mockBriefEnvelope())),
    }),
  );
  await page.route('**/ai/chat**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        mockApiResponse(
          mockBriefEnvelope({
            summary: 'mock chat reply',
            meta: { taskType: 'chat', pageContext: {}, finishReason: 'stop' },
          }),
        ),
      ),
    }),
  );
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
  await page.route('**/god-mode/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockApiResponse(mockGodModeState())),
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
}

// ---------- 视口与场景配置 ----------

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '402x874', width: 402, height: 874 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1440x1000', width: 1440, height: 1000 },
] as const;

type ScenarioAction =
  | 'none'
  | 'open-switch-status'
  | 'open-demo-control'
  | 'open-ai-chat';

interface Scenario {
  name: string;
  path: string;
  action: ScenarioAction;
}

const SCENARIOS: Scenario[] = [
  { name: 'home', path: '/', action: 'none' },
  { name: 'switch-status', path: '/', action: 'open-switch-status' },
  { name: 'demo-control', path: '/', action: 'open-demo-control' },
  { name: 'ai-chat', path: '/', action: 'open-ai-chat' },
  { name: 'trends-overview', path: '/data-center', action: 'none' },
  { name: 'my', path: '/my', action: 'none' },
];

/** 选取当前 viewport 下可见的那一份 selector（dual-DOM 适配）。 */
const visible = (sel: string) => `${sel}:visible`;

// ---------- 测试 ----------

for (const viewport of VIEWPORTS) {
  test.describe(`I7.3 截图 ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test.beforeEach(async ({ page }) => {
      await mockValoApi(page);
    });

    for (const scenario of SCENARIOS) {
      test(`${scenario.name}@${viewport.name}`, async ({ page }) => {
        await gotoAndWait(page, scenario.path);
        // 等首屏稳定（mock 全部命中，500ms 足够 morning-brief 渲染）
        await page.waitForTimeout(500);

        if (scenario.action === 'open-switch-status') {
          // 状态圆环（dual-DOM：mobile/desktop 各一份，统一 :visible）
          await page.locator(visible('[data-valo-ring="true"]')).click();
          // 等待 SwitchStatusDialog 进入动画完成
          await page.waitForTimeout(500);
        } else if (scenario.action === 'open-demo-control') {
          // DemoControlTrigger 锚点：aria-haspopup=dialog + aria-controls=demo-control-drawer
          await page
            .locator(
              '[aria-haspopup="dialog"][aria-controls="demo-control-drawer"]:visible',
            )
            .click();
          // 等抽屉进入动画 + 内容渲染（data-valo-clock 是抽屉内稳定锚点）
          await page
            .locator(visible('[data-valo-clock="true"]'))
            .waitFor({ state: 'visible', timeout: 10_000 })
            .catch(() => {
              /* 容忍：clock 锚点缺失时仍尝试截图，避免单点失败 */
            });
          await page.waitForTimeout(500);
        } else if (scenario.action === 'open-ai-chat') {
          // AIAdvisorTrigger 是 layout 全局浮层，data-valo-advisor-trigger 是稳定锚点
          await page.locator('[data-valo-advisor-trigger="true"]').click();
          // 等 advisor drawer 打开 + EmptyState 渲染
          await page.waitForTimeout(800);
        }

        await page.screenshot({
          path: path.join(
            SCREENSHOTS_DIR,
            `${scenario.name}-${viewport.name}.png`,
          ),
          fullPage: true,
        });
      });
    }
  });
}
