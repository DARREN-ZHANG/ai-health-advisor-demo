import { expect, test } from '@playwright/test';

test('smoke: page loads with title', async ({ page }) => {
  await page.goto('/');
  const title = await page.title();
  expect(title).toBeTruthy();
});
