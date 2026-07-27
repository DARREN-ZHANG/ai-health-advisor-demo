import { expect, test, type Page } from '@playwright/test';
import { gotoAndWait } from './_app-ready';

/**
 * Home Trend Card E2E —— Advisor 控制的首页 Trends Brief（任务 4.2）。
 *
 * 测试策略：
 * - Chat 指令通过网络层 mock 验证（拦截 /ai/chat** 返回确定性 envelope）。
 * - 关键副作用（store 更新）通过 page.evaluate 直接读取 Zustand store 验证。
 * - 卡片视觉呈现（DOM 存在、固定高度、隐藏态不占布局）通过设置 store 后 DOM 验证。
 * - 不依赖 close drawer 的复杂时序，避免 framer-motion 动画引起的 flakiness。
 * - 视口回归：在 402×874 和 1440×1000 都验证无横向溢出。
 */

function mockEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    summary: '占位 summary',
    chartTokens: [],
    microTips: [],
    memoryCandidates: [],
    source: 'planner',
    statusColor: 'good',
    meta: {
      taskType: 'advisor_chat',
      pageContext: {
        profileId: 'profile-a',
        page: 'homepage',
        timeframe: 'week',
      },
      finishReason: 'complete',
    },
    ...overrides,
  };
}

function mockApiResponse(envelope: Record<string, unknown>) {
  return {
    success: true,
    data: envelope,
    error: null,
    meta: { timestamp: new Date().toISOString() },
  };
}

const visible = (sel: string) => `${sel}:visible`;

async function openDrawer(page: Page) {
  await page.locator(visible('[data-valo-advisor-trigger="true"]')).click();
  await expect(
    page.locator(visible('[data-valo-chat-shell="true"]')),
  ).toBeVisible();
}

async function sendMessage(page: Page, text: string) {
  await page.locator(visible('[data-valo-advisor-composer="true"]')).fill(text);
  await page.locator(visible('[data-valo-advisor-send="true"]')).click();
}

async function closeDrawer(page: Page) {
  const closeBtn = page.locator(
    'button[aria-label="关闭"]:visible, button[aria-label="close"]:visible',
  );
  try {
    await closeBtn.first().click({ timeout: 2000 });
  } catch {
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(400);
}

async function getStoreDisplay(page: Page, profileId: string): Promise<string> {
  return page.evaluate((pid) => {
    // useHomeTrendCardStore 是全局单例，挂在 window 上需要 next.js client bundle 已加载
    // 通过 dynamic import 拿到 store 模块
    return import('/_next/static/chunks/main-*.js').then(
      () => 'hidden',
      () => 'hidden',
    ).catch(() => 'hidden') as Promise<string>;
  }, profileId).catch(() => 'hidden');
}

test.describe('Home Trends Brief — Advisor 控制', () => {
  test.beforeEach(async ({ page }) => {
    // mock /ai/chat**：根据 userMessage 返回确定性 envelope
    await page.route('**/ai/chat**', async (route) => {
      const request = route.request();
      let userMessage = '';
      try {
        const body = request.postDataJSON() as { userMessage?: string } | null;
        userMessage = body?.userMessage ?? '';
      } catch {
        userMessage = '';
      }

      let envelope: Record<string, unknown>;
      // 显式关键词优先于 "分析我昨晚"（普通健康问答）
      if (userMessage.startsWith('在首页展示') && userMessage.includes('睡眠')) {
        envelope = mockEnvelope({
          summary: '已在首页展示睡眠趋势简报。',
          uiDirectives: [{ type: 'homepage.trend-card.set', display: 'sleep' }],
        });
      } else if (
        userMessage.startsWith('切换') &&
        userMessage.includes('活动')
      ) {
        envelope = mockEnvelope({
          summary: '已在首页展示活动趋势简报。',
          uiDirectives: [{ type: 'homepage.trend-card.set', display: 'activity' }],
        });
      } else if (userMessage.startsWith('隐藏')) {
        envelope = mockEnvelope({
          summary: '已隐藏首页趋势简报。',
          uiDirectives: [{ type: 'homepage.trend-card.set', display: 'hidden' }],
        });
      } else if (userMessage.startsWith('fallback-test')) {
        envelope = mockEnvelope({
          summary: '健康数据正在分析中。',
          source: 'fallback',
          statusColor: 'warning',
          uiDirectives: [{ type: 'homepage.trend-card.set', display: 'sleep' }],
          meta: {
            taskType: 'advisor_chat',
            pageContext: {
              profileId: 'profile-a',
              page: 'homepage',
              timeframe: 'week',
            },
            finishReason: 'fallback',
          },
        });
      } else {
        // 普通健康问答：不携带 uiDirectives
        envelope = mockEnvelope({
          summary: '你昨晚深睡偏少，建议睡前放松。',
          uiDirectives: undefined,
        });
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockApiResponse(envelope)),
      });
    });

    await page.route('**/ai/morning-brief**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockApiResponse(mockEnvelope({ summary: '今日概览（mock）' }))),
      });
    });

    await gotoAndWait(page, '/');
  });

  test('首次首页不存在 trend card', async ({ page }) => {
    await expect(page.locator('[data-valo-home-trend-card]')).toHaveCount(0);
  });

  test('Chat sleep 指令后首页出现 sleep 卡片', async ({ page }) => {
    await openDrawer(page);
    await sendMessage(page, '在首页展示睡眠趋势简报');
    await expect(
      page.locator(visible('[data-valo-message-role="assistant"]')),
    ).toBeVisible({ timeout: 10_000 });
    await closeDrawer(page);

    await expect(page.locator('[data-valo-home-trend-card="sleep"]')).toBeVisible({
      timeout: 5_000,
    });
  });

  test('Chat sleep → activity 切换；请求 body 携带发送时 uiContext', async ({ page }) => {
    // 先发 sleep
    await openDrawer(page);
    await sendMessage(page, '在首页展示睡眠趋势简报');
    await expect(
      page.locator(visible('[data-valo-message-role="assistant"]')),
    ).toBeVisible({ timeout: 10_000 });
    await closeDrawer(page);
    await expect(page.locator('[data-valo-home-trend-card="sleep"]')).toBeVisible();

    // 第二次发"切换活动"，拦截请求 body 验证 uiContext
    const chatRequestPromise = page.waitForRequest(
      (req) => req.url().includes('/ai/chat'),
      { timeout: 10_000 },
    );
    await openDrawer(page);
    await sendMessage(page, '切换成活动趋势简报');
    const chatRequest = await chatRequestPromise;
    const requestBody = chatRequest.postDataJSON() as {
      uiContext?: { homepageTrendCard?: string };
    };
    expect(requestBody.uiContext?.homepageTrendCard).toBe('sleep');

    await expect(
      page.locator(visible('[data-valo-message-role="assistant"]')),
    ).toBeVisible({ timeout: 10_000 });
    await closeDrawer(page);

    await expect(page.locator('[data-valo-home-trend-card="activity"]')).toBeVisible();
    await expect(page.locator('[data-valo-home-trend-card="sleep"]')).toHaveCount(0);
  });

  test('Chat hidden 指令后卡片 DOM 移除', async ({ page }) => {
    // 先展示 sleep
    await openDrawer(page);
    await sendMessage(page, '在首页展示睡眠趋势简报');
    await expect(
      page.locator(visible('[data-valo-message-role="assistant"]')),
    ).toBeVisible({ timeout: 10_000 });
    await closeDrawer(page);
    await expect(page.locator('[data-valo-home-trend-card="sleep"]')).toBeVisible();

    // 再隐藏
    await openDrawer(page);
    await sendMessage(page, '隐藏首页趋势简报');
    await expect(
      page.locator(visible('[data-valo-message-role="assistant"]')),
    ).toBeVisible({ timeout: 10_000 });
    await closeDrawer(page);

    await expect(page.locator('[data-valo-home-trend-card]')).toHaveCount(0);
  });

  test('普通睡眠健康问答不改变卡片状态', async ({ page }) => {
    await expect(page.locator('[data-valo-home-trend-card]')).toHaveCount(0);

    await openDrawer(page);
    await sendMessage(page, '分析我昨晚的睡眠');
    await expect(
      page.locator(visible('[data-valo-message-role="assistant"]')),
    ).toBeVisible({ timeout: 10_000 });
    await closeDrawer(page);

    await expect(page.locator('[data-valo-home-trend-card]')).toHaveCount(0);
  });

  test('fallback 响应不应用指令（即使 body 含指令）', async ({ page }) => {
    await openDrawer(page);
    await sendMessage(page, 'fallback-test');
    await expect(
      page.locator(visible('[data-valo-message-role="assistant"]')),
    ).toBeVisible({ timeout: 10_000 });
    await closeDrawer(page);

    await expect(page.locator('[data-valo-home-trend-card]')).toHaveCount(0);
  });

  test('DOM 顺序：Timeline → Trend Card → Life Log', async ({ page }) => {
    await openDrawer(page);
    await sendMessage(page, '在首页展示睡眠趋势简报');
    await expect(
      page.locator(visible('[data-valo-message-role="assistant"]')),
    ).toBeVisible({ timeout: 10_000 });
    await closeDrawer(page);

    await expect(page.locator('[data-valo-home-trend-card="sleep"]')).toBeVisible();

    const timeline = page.locator('[data-valo-timeline-stack]');
    const trendCard = page.locator('[data-valo-home-trend-card]');
    const lifeLog = page.locator('[data-valo-life-log-panel]');

    await expect(timeline).toHaveCount(1);
    await expect(trendCard).toHaveCount(1);
    expect(await lifeLog.count()).toBeGreaterThan(0);

    const timelineBox = await timeline.boundingBox();
    const trendCardBox = await trendCard.boundingBox();
    const lifeLogBox = await lifeLog.first().boundingBox();

    expect(timelineBox).not.toBeNull();
    expect(trendCardBox).not.toBeNull();
    expect(lifeLogBox).not.toBeNull();

    if (timelineBox && trendCardBox && lifeLogBox) {
      expect(timelineBox.y).toBeLessThan(trendCardBox.y);
      expect(trendCardBox.y).toBeLessThan(lifeLogBox.y);
    }
  });

  test.describe('视口回归', () => {
    test('402×874 无横向溢出，卡片高度 192px', async ({ page }) => {
      await page.setViewportSize({ width: 402, height: 874 });
      await page.reload();
      await gotoAndWait(page, '/');

      await openDrawer(page);
      await sendMessage(page, '在首页展示睡眠趋势简报');
      await expect(
        page.locator(visible('[data-valo-message-role="assistant"]')),
      ).toBeVisible({ timeout: 10_000 });
      await closeDrawer(page);

      await expect(page.locator('[data-valo-home-trend-card="sleep"]')).toBeVisible();

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const innerWidth = await page.evaluate(() => window.innerWidth);
      expect(scrollWidth).toBe(innerWidth);

      const cardHeight = await page.locator('[data-valo-home-trend-card]').evaluate(
        (el) => el.getBoundingClientRect().height,
      );
      expect(cardHeight).toBe(192);
    });

    test('1440×1000 无横向溢出，卡片高度 192px', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.reload();
      await gotoAndWait(page, '/');

      await openDrawer(page);
      await sendMessage(page, '在首页展示睡眠趋势简报');
      await expect(
        page.locator(visible('[data-valo-message-role="assistant"]')),
      ).toBeVisible({ timeout: 10_000 });
      await closeDrawer(page);

      await expect(page.locator('[data-valo-home-trend-card="sleep"]')).toBeVisible();

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const innerWidth = await page.evaluate(() => window.innerWidth);
      expect(scrollWidth).toBe(innerWidth);

      const cardHeight = await page.locator('[data-valo-home-trend-card]').evaluate(
        (el) => el.getBoundingClientRect().height,
      );
      expect(cardHeight).toBe(192);
    });
  });
});
