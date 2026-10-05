import { expect, test, type Page } from '@playwright/test';
import { openNewNotebook, waitReady } from './helpers/pen';

const toggle = (page: Page, name: '收起選單' | '展開選單') => page.getByRole('button', { name, exact: true });

/** 第 1 頁頂端附近的點是不是落在頁面上（沒有被選單蓋住），以及整頁是否在螢幕內 */
const pageTop = (page: Page) =>
  page.evaluate(() => {
    const r = document.querySelector('.page[data-index="0"]')!.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 10);
    return {
      onPage: !!hit?.closest('.page'),
      inView: r.top >= 0 && r.bottom <= document.documentElement.clientHeight,
    };
  });

test.beforeEach(async ({ page }) => {
  await openNewNotebook(page);
});

test('預設展開；收起後選單隱藏、整頁可見，重新整理後維持', async ({ page }) => {
  await expect(page.getByRole('toolbar', { name: '工具列' })).toBeVisible();
  await expect(page.locator('.topbar')).toBeVisible();

  await toggle(page, '收起選單').click();
  await expect(page.getByRole('toolbar', { name: '工具列' })).toBeHidden();
  await expect(page.locator('.topbar')).toBeHidden();
  expect(await pageTop(page)).toEqual({ onPage: true, inView: true });

  await page.reload();
  await waitReady(page);
  await expect(page.getByRole('toolbar', { name: '工具列' })).toBeHidden();

  await toggle(page, '展開選單').click();
  await expect(page.getByRole('toolbar', { name: '工具列' })).toBeVisible();
  await page.reload();
  await waitReady(page);
  await expect(page.getByRole('toolbar', { name: '工具列' })).toBeVisible();
});

test('展開時選單浮在頁面上方，切換不改變頁面大小與捲動位置', async ({ page }) => {
  const box = () =>
    page.evaluate(() => {
      const r = document.querySelector('.page-slot')!.getBoundingClientRect();
      return { top: r.top, w: r.width, scrollY: window.scrollY };
    });
  await page.evaluate(() => window.scrollTo(0, 300));
  const before = await box();
  await toggle(page, '收起選單').click();
  expect(await box()).toEqual(before);
  await toggle(page, '展開選單').click();
  expect(await box()).toEqual(before);
});

test('收起狀態下回到書架，頂端列正常顯示', async ({ page }) => {
  await toggle(page, '收起選單').click();
  await page.goBack();
  await expect(page.getByRole('button', { name: '新增筆記本' })).toBeVisible();
  await expect(page.locator('.topbar')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-chrome');
});
