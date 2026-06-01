import { expect, test } from '@playwright/test';

test.describe('Homepage action interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('calendar action shows add-to-schedule button without opening active sensing', async ({ page }) => {
    const calendarButton = page.getByRole('button', { name: '添加进日程' }).first();
    if (!(await calendarButton.isVisible().catch(() => false))) {
      test.skip(true, 'Current brief did not produce a calendar action in this environment');
      return;
    }

    await calendarButton.click();

    await expect(page.getByText('已添加进日程')).toBeVisible();
    await expect(page.getByRole('button', { name: '已添加' }).first()).toBeVisible();
    await expect(page.getByText('AI Proactive Insight')).not.toBeVisible();
  });

  test('micro event action updates realtime brief and does not show active sensing banner', async ({ page }) => {
    const microAction = page.getByText(/深呼吸|起身走|饭后走|慢走|离屏|肩颈|拉伸|低刺激/).first();
    if (!(await microAction.isVisible().catch(() => false))) {
      test.skip(true, 'Current brief did not produce a micro event action in this environment');
      return;
    }

    await microAction.click();

    await expect(page.getByText('正在更新实时简报...')).toBeVisible();
    await expect(page.getByText('已记录，正在更新实时简报')).toBeVisible();
    await expect(page.getByText('AI Proactive Insight')).not.toBeVisible();
  });
});
