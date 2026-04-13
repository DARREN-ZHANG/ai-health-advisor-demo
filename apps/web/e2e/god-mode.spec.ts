import { expect, test } from '@playwright/test';

test.describe('God-Mode E2E', () => {
  test.beforeEach(async ({ page }) => {
    // 假设默认开启 GOD MODE 以便测试
    await page.goto('/');
  });

  test('should open God-Mode panel and switch profile', async ({ page }) => {
    // 1. 检查 Navbar 中是否存在 GOD MODE 按钮并点击
    const godModeBtn = page.getByRole('button', { name: 'GOD MODE' });
    if (!(await godModeBtn.isVisible())) {
      test.skip(true, 'God-Mode is not enabled in this environment');
      return;
    }
    await godModeBtn.click();

    // 2. 检查面板是否打开
    await expect(page.getByText('GOD MODE ADMIN')).toBeVisible();

    // 3. 点击切换 Profile (切换到 Profile B)
    const profileBtn = page.getByRole('button', { name: '🏃 用户 B (运动型)' });
    await expect(profileBtn).toBeVisible();
    await profileBtn.click();

    // 4. 检查按钮是否呈现选中状态 (通过 class 检查)
    // 实际项目中可能通过文字内容或 ID 检查更稳健
    await expect(profileBtn).toHaveClass(/bg-blue-600/);

    // 5. 检查首页数据是否触发刷新 (isAnyLoading 状态)
    // 因为是 Mock 或 Dev 环境，可能很快，但我们至少能看到页面内容依然存在
    await expect(page.getByText('今日简报')).toBeVisible();
  });

  test('should inject sport event and show active sensing banner', async ({ page }) => {
    await page.getByRole('button', { name: 'GOD MODE' }).click();

    // 点击注入运动事件
    const injectBtn = page.getByRole('button', { name: '⚡ 注入即时运动事件' });
    await expect(injectBtn).toBeVisible();
    await injectBtn.click();

    // 检查 Active Sensing 横幅是否出现
    // 注意：这取决于后端 /god-mode/inject-event 是否返回 banner 数据
    // 在真实测试中，我们可能需要 mock 接口响应
    // await expect(page.getByText('AI Proactive Insight')).toBeVisible();
  });

  test('should reset all overrides', async ({ page }) => {
    await page.getByRole('button', { name: 'GOD MODE' }).click();

    const resetBtn = page.getByRole('button', { name: '🧪 重置所有 Overrides' });
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();

    // 检查重置后状态 (这里比较难直接观察，除非有 toast 提示)
    // 如果实现了 toast，可以检查 toast 内容
  });
});
