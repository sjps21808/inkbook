import { expect, test } from '@playwright/test';
import { drawStroke, elementCount, hLine, inkPixel, openNewNotebook } from './helpers/pen';

test('沒有筆記本時顯示空狀態，動作列存在', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('還沒有筆記本')).toBeVisible();
  await expect(page.locator('.library-actions')).toBeVisible();
});

test('兩本筆記本內容互不影響，返回書架後可以再開啟', async ({ page }) => {
  await openNewNotebook(page, '數學');
  await expect(page.locator('.nb-title')).toHaveText('數學');
  await drawStroke(page, hLine(0.3));
  await expect.poll(() => elementCount(page)).toBe(1);

  await page.getByRole('button', { name: '‹ 書架' }).click();
  await page.getByRole('button', { name: '新增筆記本' }).click();
  await page.getByLabel('筆記本標題').fill('英文');
  await page.getByRole('button', { name: '建立' }).click();
  await expect(page.locator('.nb-title')).toHaveText('英文');
  await page.waitForTimeout(200);
  expect((await inkPixel(page, [0.5, 0.3]))[3]).toBe(0);

  await page.getByRole('button', { name: '‹ 書架' }).click();
  const cards = page.locator('.notebook-card .title');
  await expect(cards).toHaveText(['英文', '數學']); // 依修改時間排序，新的在前

  await page.locator('.notebook-card', { hasText: '數學' }).click();
  await expect(page.locator('.nb-title')).toHaveText('數學');
  await expect.poll(async () => (await inkPixel(page, [0.5, 0.3]))[3]).toBe(255);
});

test('空白標題會建立「未命名筆記本」', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '新增筆記本' }).click();
  await page.getByRole('button', { name: '建立' }).click();
  await expect(page.locator('.nb-title')).toHaveText('未命名筆記本');
});

test('重新整理會停留在同一本筆記本', async ({ page }) => {
  await openNewNotebook(page, '物理');
  await page.reload();
  await expect(page.locator('.nb-title')).toHaveText('物理');
});
