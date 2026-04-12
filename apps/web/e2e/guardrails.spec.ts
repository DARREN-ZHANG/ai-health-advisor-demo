import { expect, test } from '@playwright/test';

test.describe('Platform Guardrails & Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should navigate between Home and Data Center', async ({ page }) => {
    // 检查首页内容
    await expect(page.getByText('今日简报')).toBeVisible();

    // 点击导航到数据中心
    await page.getByRole('link', { name: '数据中心' }).click();
    await expect(page.url()).toContain('/data-center');
    await expect(page.getByText('数据完整度')).toBeVisible();

    // 检查 Tab 切换
    const sleepTab = page.getByRole('button', { name: '睡眠分析' });
    await sleepTab.click();
    // 检查图表容器标题是否更新
    await expect(page.getByText('睡眠分析')).toBeVisible();
  });

  test('should trigger AI View Summary in Data Center', async ({ page }) => {
    await page.goto('/data-center');
    
    // 点击悬浮按钮
    const summaryBtn = page.locator('button').filter({ hasText: 'AI' }); // ViewSummaryTrigger
    await summaryBtn.click();

    // 检查弹窗是否显示
    await expect(page.getByText('AI 视图总结')).toBeVisible();
  });
});
