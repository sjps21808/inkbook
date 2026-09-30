import { expect, test } from '@playwright/test';

test('首頁可以開啟', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveTitle('InkBook');
});
