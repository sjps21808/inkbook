import { expect, test, type Page } from '@playwright/test';
import { bgPixel, openNewNotebook } from './helpers/pen';

/** 元素計算後的背景色 */
const bgColor = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => getComputedStyle(el).backgroundColor);

const WHITE = 'rgb(255, 255, 255)';

test.describe('深色模式', () => {
  test.use({ colorScheme: 'dark' });

  test('UI 變成深色，頁面、縮圖維持白紙', async ({ page }) => {
    await openNewNotebook(page);
    expect(await bgColor(page, 'body')).toBe('rgb(0, 0, 0)');
    expect(await bgColor(page, '.toolbar')).toBe('rgb(22, 22, 24)');
    expect(await bgColor(page, '.toolbar button')).toBe('rgb(28, 28, 30)');
    expect(await page.locator('.toolbar button').first().evaluate((el) => getComputedStyle(el).color)).toBe(
      'rgb(242, 242, 247)',
    );

    expect(await bgColor(page, '.page')).toBe(WHITE);
    expect(await bgPixel(page, [300, 400])).toEqual([255, 255, 255, 255]);

    await page.getByRole('button', { name: '頁面', exact: true }).click();
    await page.locator('.thumb-img img').first().waitFor();
    expect(await bgColor(page, '.thumb-img')).toBe(WHITE);
  });

  test('書架、選單與對話框也是深色', async ({ page }) => {
    await openNewNotebook(page, '數學');
    await page.getByRole('button', { name: '‹ 書架' }).click();
    expect(await bgColor(page, '.topbar')).toBe('rgb(28, 28, 30)');
    expect(await bgColor(page, '.notebook-card')).toBe('rgb(28, 28, 30)');
    await page.getByRole('button', { name: '數學 選項' }).click();
    expect(await bgColor(page, '.item-menu .menu')).toBe('rgb(28, 28, 30)');
    await page.getByRole('menuitem', { name: '重新命名' }).click();
    expect(await bgColor(page, '.dialog')).toBe('rgb(28, 28, 30)');
  });
});

test('淺色模式維持原本的配色', async ({ page }) => {
  await openNewNotebook(page);
  expect(await bgColor(page, 'body')).toBe('rgb(242, 242, 245)');
  expect(await bgColor(page, '.toolbar')).toBe('rgb(249, 249, 251)');
  expect(await bgColor(page, '.page')).toBe(WHITE);
});
