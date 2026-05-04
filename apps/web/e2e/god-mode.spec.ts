import { expect, test } from '@playwright/test';

test.describe('God-Mode E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should switch profile from homepage config area', async ({ page }) => {
    // 1. 检查首页是否存在 Profile Switch 区域
    const profileSection = page.getByRole('button', { name: /用户 B/ });
    if (!(await profileSection.isVisible().catch(() => false))) {
      test.skip(true, 'God-Mode is not enabled in this environment');
      return;
    }

    // 2. 点击切换 Profile (切换到 Profile B)
    await profileSection.click();

    // 3. 检查按钮是否呈现选中状态
    await expect(profileSection).toHaveClass(/bg-blue-600/);

    // 4. 检查首页数据是否触发刷新
    await expect(page.getByText('实时简报').or(page.getByText('Live Briefing'))).toBeVisible();
  });

  test('should append timeline segment and show active sensing banner', async ({ page }) => {
    // 移动端需要先打开配置抽屉；桌面端直接可见
    const configButton = page.getByRole('button', { name: 'Config' }).or(page.getByLabel('Config'));
    if (await configButton.isVisible().catch(() => false)) {
      await configButton.click();
    }

    // 点击追加运动片段
    const cardioBtn = page.getByRole('button', { name: '🏃' });
    await expect(cardioBtn).toBeVisible();
    await cardioBtn.click();

    // 检查 Active Sensing 横幅是否出现
    await expect(page.getByText('AI Proactive Insight')).toBeVisible();
  });

  test('should reset timeline from homepage config area', async ({ page }) => {
    const configButton = page.getByRole('button', { name: 'Config' }).or(page.getByLabel('Config'));
    if (await configButton.isVisible().catch(() => false)) {
      await configButton.click();
    }

    const resetBtn = page.getByRole('button', { name: /reset/i });
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();

    // 重置后页面应仍然正常
    await expect(page.getByText('实时简报').or(page.getByText('Live Briefing'))).toBeVisible();
  });
});
