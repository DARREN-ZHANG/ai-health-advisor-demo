import { expect, test, type Page } from '@playwright/test';
import { gotoAndWait } from './_app-ready';

function envelope(data: unknown) {
  return { success: true, data, error: null, meta: { timestamp: new Date().toISOString() } };
}

async function mockApi(page: Page) {
  await page.route('**/profiles', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(envelope([{ profileId: 'profile-a', name: '用户 A' }])),
    }),
  );
  await page.route('**/ai/morning-brief**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        envelope({
          summary: 'mock brief',
          chartTokens: [],
          microTips: [],
          memoryCandidates: [],
          actions: [],
          source: 'llm',
          statusColor: 'good',
          meta: { taskType: 'morning-brief', pageContext: {}, finishReason: 'stop' },
        }),
      ),
    }),
  );
  await page.route('**/profiles/*/data**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(envelope({ timeline: [], summary: { completeness: 0.8 } })),
    }),
  );
  await page.route('**/profiles/*/chart-data**', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope([])) }),
  );
  await page.route('**/profiles/*/device-sync**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        envelope({
          profileId: 'profile-a',
          totalDeviceSamples: 0,
          pendingDeviceSamples: 0,
          syncSessions: [],
        }),
      ),
    }),
  );
  await page.route('**/god-mode/**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        envelope({
          currentProfileId: 'profile-a',
          timeline: [],
          recentRecognizedEvents: [],
          activeSensing: null,
          currentDemoTime: '2026-06-21T08:00:00.000Z',
        }),
      ),
    }),
  );
}

async function openPanel(page: Page) {
  await page.locator('[aria-haspopup="dialog"][aria-controls="demo-control-drawer"]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test.describe('Add Event', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await gotoAndWait(page, '/');
  });

  test('以设计稿样式显示原有全部十三个事件', async ({ page }) => {
    await openPanel(page);
    await expect(page.getByRole('heading', { name: /添加事件|Add Event/ })).toBeVisible();
    await expect(
      page.getByRole('dialog').locator('button[aria-label^="添加 "], button[aria-label^="Add "]'),
    ).toHaveCount(13);
    await expect(page.getByText(/日常节律|Daily Rhythm/)).toHaveCount(0);
    await expect(page.getByText('LIVE', { exact: true })).toHaveCount(0);
    await expect(page.getByText('+1h', { exact: true })).toHaveCount(0);
  });

  test('普通事件触发 timeline append', async ({ page }) => {
    await openPanel(page);
    const request = page.waitForRequest(
      (candidate) =>
        candidate.method() === 'POST' && candidate.url().includes('/god-mode/timeline-append'),
    );
    await page.getByRole('button', { name: /添加 散步|Add Walk/ }).click();
    expect((await request).postDataJSON().segmentType).toBe('walk');
  });

  test('概率事件触发 inject event', async ({ page }) => {
    await openPanel(page);
    const request = page.waitForRequest(
      (candidate) =>
        candidate.method() === 'POST' && candidate.url().includes('/god-mode/inject-event'),
    );
    await page.getByRole('button', { name: /添加 咖啡因|Add Caffeine/ }).click();
    expect((await request).postDataJSON().eventType).toBe('possible_caffeine_intake');
  });

  test('关闭按钮关闭面板', async ({ page }) => {
    await openPanel(page);
    await page.getByRole('button', { name: /关闭|Close/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
