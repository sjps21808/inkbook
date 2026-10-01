import { expect, test } from '@playwright/test';

test('?debug=1 時載入 eruda', async ({ page }) => {
  await page.goto('./?debug=1');
  await expect(page.locator('#eruda')).toHaveCount(1);
});

test('一般開啟時不載入 eruda', async ({ page }) => {
  const erudaRequests: string[] = [];
  page.on('request', (r) => {
    if (/eruda/i.test(r.url())) erudaRequests.push(r.url());
  });
  await page.goto('./');
  await expect(page.getByRole('button', { name: '新增筆記本' })).toBeVisible();
  await expect(page.locator('#eruda')).toHaveCount(0);
  expect(erudaRequests).toEqual([]);
});
