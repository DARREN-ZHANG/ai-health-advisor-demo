import { expect, test, type Page } from '@playwright/test';
import { gotoAndWait } from './_app-ready';

/**
 * Plan Flow E2E —— AI 生成计划 → Chat 调整 → 执行 → Plan checklist 全流程。
 *
 * 测试策略：
 * - Chat 响应、plan lifecycle 端点全部走网络层 mock，保证确定性。
 * - draftId 用稳定字符串，便于在 chat 调整场景下断言旧 draftId 失效。
 * - 关键 UI 锚点：
 *   - advisor drawer 内 [data-valo-plan-draft-content]：渲染完整计划正文
 *   - [data-valo-plan-draft-execute]：执行按钮
 *   - 首页 [data-valo-home-plan]：执行后的 Day 1 计划管理卡
 *   - [data-valo-plan-task-toggle]：叶子任务勾选按钮
 *   - [data-valo-plan-end]：结束当前计划按钮
 */

const visible = (sel: string) => `${sel}:visible`;

const validDraftPayload = {
  title: '7 天恢复计划',
  summary: '本周以稳定 HRV 与改善睡眠为主。',
  groups: [
    {
      title: '第 1 天',
      tasks: [{ title: '餐后散步 15 分钟', estimatedMinutes: 15 }, { title: '记录晨起 HRV' }],
    },
    { title: '第 2 天', tasks: [{ title: '23:00 前入睡', suggestedTimeOfDay: '夜间' }] },
  ],
};

function envelopeWithDraft(draftId: string) {
  return {
    success: true,
    data: {
      summary: '这段通用健康分析在计划响应中不应显示。',
      chartTokens: ['SLEEP_7DAYS'],
      microTips: ['这条额外贴士不应显示'],
      source: 'llm',
      statusColor: 'good',
      planDraft: {
        draftId,
        ...validDraftPayload,
        createdAt: '2026-07-27T00:00:00.000Z',
      },
      meta: {
        taskType: 'advisor_chat',
        pageContext: {
          profileId: 'profile-a',
          page: 'homepage',
          timeframe: 'week',
        },
        finishReason: 'complete',
      },
    },
    error: null,
    meta: { timestamp: new Date().toISOString() },
  };
}

const executedPlan = {
  id: 'plan-exec-1',
  profileId: 'profile-a',
  sessionId: 'session-e2e',
  title: validDraftPayload.title,
  summary: validDraftPayload.summary,
  groups: [
    {
      id: 'g1',
      title: '第 1 天',
      tasks: [
        { id: 't1', title: '餐后散步 15 分钟', completed: false, estimatedMinutes: 15 },
        { id: 't2', title: '记录晨起 HRV', completed: false },
      ],
    },
    {
      id: 'g2',
      title: '第 2 天',
      tasks: [{ id: 't3', title: '23:00 前入睡', suggestedTimeOfDay: '夜间', completed: false }],
    },
  ],
  status: 'active',
  version: 1,
  progress: { totalTasks: 3, completedTasks: 0 },
  createdAt: '2026-07-27T00:00:00.000Z',
  executedAt: '2026-07-27T00:00:00.000Z',
};

async function openDrawer(page: Page) {
  await page.locator(visible('[data-valo-advisor-trigger="true"]')).click();
  await expect(page.locator(visible('[data-valo-chat-shell="true"]'))).toBeVisible();
}

async function sendMessage(page: Page, text: string) {
  await page.locator(visible('[data-valo-advisor-composer="true"]')).fill(text);
  await page.locator(visible('[data-valo-advisor-send="true"]')).click();
}

test.describe('Plan generation & execution', () => {
  test('produces a visible draft, executes it, and renders the homepage checklist', async ({
    page,
  }) => {
    let draftCounter = 0;
    let executed = false;

    await page.route('**/ai/chat**', async (route) => {
      draftCounter += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelopeWithDraft(`draft-${draftCounter}`)),
      });
    });

    await page.route('**/sessions/*/profiles/*/plans/drafts/*/execute', async (route) => {
      executed = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: executedPlan,
          error: null,
          meta: { timestamp: new Date().toISOString() },
        }),
      });
    });

    await page.route('**/sessions/*/profiles/*/plans/current', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: executed ? executedPlan : null,
            error: null,
            meta: { timestamp: new Date().toISOString() },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await gotoAndWait(page, '/');
    await openDrawer(page);
    await sendMessage(page, '给我一份 7 天计划');

    // chat 响应带 planDraft → 完整正文与操作按钮均渲染
    await expect(page.locator(visible('[data-valo-plan-draft="executable"]'))).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator(visible('[data-valo-plan-draft-content="true"]'))).toContainText(
      '7 天恢复计划',
    );
    await expect(page.locator(visible('[data-valo-plan-draft-group="0"]'))).toContainText(
      '餐后散步 15 分钟',
    );
    await expect(page.locator(visible('[data-valo-plan-draft-group="1"]'))).toContainText(
      '23:00 前入睡',
    );
    await expect(
      page.getByText('这段通用健康分析在计划响应中不应显示。'),
    ).toHaveCount(0);
    await expect(page.locator('[data-valo-message-charts="true"]')).toHaveCount(0);
    await expect(page.locator(visible('[data-valo-plan-draft-execute="true"]'))).toBeVisible();

    // 第二轮 chat 产出新 draft → 旧 draftId 应变为 revoked
    await sendMessage(page, '改成 5 天');
    await expect(page.locator(visible('[data-valo-plan-draft="revoked"]')).first()).toBeVisible({
      timeout: 10_000,
    });

    // 执行最新 draft
    await page
      .locator(visible('[data-valo-plan-draft="executable"] [data-valo-plan-draft-execute="true"]'))
      .click();

    // 执行后关闭 Chat，留在首页并展示默认 Day 1 的计划管理卡。
    await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
    await expect(page.locator('[data-valo-home-plan="true"]')).toBeVisible();
    await expect(page.locator('[data-valo-home-plan-day="1"]')).toBeVisible();
    await expect(page.locator('[data-valo-home-plan-task="t1"]')).toBeVisible();

    // 勾选任务：服务端 PATCH 返回 version+1
    await page.route('**/sessions/*/profiles/*/plans/*/groups/*/tasks/*', async (route) => {
      if (route.request().method() !== 'PATCH') {
        await route.continue();
        return;
      }
      const next = {
        ...executedPlan,
        version: 2,
        groups: executedPlan.groups.map((g) =>
          g.id === 'g1'
            ? {
                ...g,
                tasks: g.tasks.map((t) => (t.id === 't1' ? { ...t, completed: true } : t)),
              }
            : g,
        ),
        progress: { totalTasks: 3, completedTasks: 1 },
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: next,
          error: null,
          meta: { timestamp: new Date().toISOString() },
        }),
      });
    });

    await page.locator('[data-valo-home-plan-task="t1"] button').click();
    await expect(page.locator('[data-valo-home-plan-task-completed="true"]')).toHaveCount(1, {
      timeout: 10_000,
    });
  });

  test('profile isolation: profile-a plan is invisible to profile-b', async ({ page }) => {
    await page.route('**/sessions/*/profiles/profile-a/plans/current', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: executedPlan,
          error: null,
          meta: { timestamp: new Date().toISOString() },
        }),
      });
    });
    await page.route('**/sessions/*/profiles/profile-b/plans/current', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: null,
          error: null,
          meta: { timestamp: new Date().toISOString() },
        }),
      });
    });

    await gotoAndWait(page, '/plan');
    // 默认 profile-a 应能看到计划
    await expect(page.locator('[data-valo-plan-screen="true"]')).toBeVisible();
    await expect(page.locator('[data-valo-plan-group-id="g1"]')).toBeVisible();

    // 切到 profile-b（通过 god-mode 接口）
    await page.evaluate(async () => {
      const res = await fetch('/god-mode/switch-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: 'profile-b' }),
      });
      return res.status;
    });

    await page.reload();
    await gotoAndWait(page, '/plan');
    await expect(page.locator('[data-valo-plan-screen="true"]')).toBeHidden();
  });

  test('end plan clears the current plan after confirmation', async ({ page }) => {
    let planActive = true;
    await page.route('**/sessions/*/profiles/*/plans/current', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: planActive ? executedPlan : null,
            error: null,
            meta: { timestamp: new Date().toISOString() },
          }),
        });
      } else if (route.request().method() === 'DELETE') {
        planActive = false;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { ended: true },
            error: null,
            meta: { timestamp: new Date().toISOString() },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await gotoAndWait(page, '/plan');
    await expect(page.locator('[data-valo-plan-screen="true"]')).toBeVisible();

    page.on('dialog', (dialog) => dialog.accept());
    await page.locator('[data-valo-plan-end="true"]').click();

    await expect(page.locator('[data-valo-plan-screen="true"]')).toBeHidden({
      timeout: 10_000,
    });
  });
});
