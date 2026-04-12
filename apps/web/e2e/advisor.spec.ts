import { expect, test } from '@playwright/test';

test.describe('AI Advisor E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should open advisor drawer and send a message', async ({ page }) => {
    // 1. 点击 AI 顾问入口
    const trigger = page.getByLabel('打开 AI 顾问');
    await expect(trigger).toBeVisible();
    await trigger.click();

    // 2. 检查 Drawer 是否打开
    const drawerTitle = page.getByText('AI Health Advisor', { exact: false });
    await expect(drawerTitle).toBeVisible();

    // 3. 发送消息
    const input = page.getByPlaceholder('问我点什么...');
    await input.fill('你好，帮我分析一下最近的睡眠');
    await page.keyboard.press('Enter');

    // 4. 检查用户消息是否出现在列表中
    await expect(page.getByText('你好，帮我分析一下最近的睡眠')).toBeVisible();

    // 5. 检查 AI 是否正在加载 (Loading dots)
    // 这里因为是 Mock 后端，可能会很快返回或超时，取决于后端状态
    // 如果后端没开，可能会报错并显示 Toast
  });

  test('should clear chat history', async ({ page }) => {
    await page.getByLabel('打开 AI 顾问').click();
    
    const input = page.getByPlaceholder('问我点什么...');
    await input.fill('这是一条测试消息');
    await page.keyboard.press('Enter');
    
    await expect(page.getByText('这是一条测试消息')).toBeVisible();

    // 点击清除按钮
    const clearBtn = page.getByRole('button', { name: 'Clear Chat' });
    await expect(clearBtn).toBeVisible();
    
    // 监听 window.confirm
    page.once('dialog', dialog => dialog.accept());
    await clearBtn.click();

    // 检查消息是否被清空
    await expect(page.getByText('这是一条测试消息')).not.toBeVisible();
    await expect(page.getByText('我是你的 AI 健康顾问')).toBeVisible();
  });
});
