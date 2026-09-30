import { expect, test } from '@playwright/test';

test('繁體中文外框', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
  await expect(page.getByRole('heading', { name: 'InkBook' })).toBeVisible();
  await expect(page.getByText('還沒有筆記本')).toBeVisible();
  const userSelect = await page.evaluate(
    () => getComputedStyle(document.body).webkitUserSelect || getComputedStyle(document.body).userSelect,
  );
  expect(userSelect).toBe('none');
});
