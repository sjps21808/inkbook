import { expect, test, type Page } from '@playwright/test';
import { drawStroke, elementCount, hLine, openNewNotebook, waitReady } from './helpers/pen';

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

test('收起時套索選取：右上角可以複製、刪除選取', async ({ page }) => {
  await drawStroke(page, hLine(0.3));
  await expect.poll(() => elementCount(page)).toBe(1);
  await page.getByRole('button', { name: '套索', exact: true }).click();
  await toggle(page, '收起選單').click();
  const float = page.locator('.chrome-float');
  await expect(float.getByRole('button', { name: '刪除選取' })).toHaveCount(0);

  await drawStroke(page, [
    [0.1, 0.25],
    [0.9, 0.25],
    [0.9, 0.35],
    [0.1, 0.35],
    [0.1, 0.25],
  ]);
  await float.getByRole('button', { name: '複製選取' }).click();
  await expect.poll(() => elementCount(page)).toBe(2);
  await float.getByRole('button', { name: '刪除選取' }).click();
  await expect.poll(() => elementCount(page)).toBe(1);
  await expect(float.getByRole('button', { name: '刪除選取' })).toHaveCount(0);
});

test('收起時有新版本：收起按鈕顯示紅點，展開後消失', async ({ page }) => {
  const dot = () =>
    page.evaluate(() => getComputedStyle(document.querySelector('.chrome-toggle')!, '::after').content);
  await toggle(page, '收起選單').click();
  expect(await dot()).toBe('none');
  // 模擬 UpdatePrompt 偵測到新版（測試時擋掉 SW）
  await page.evaluate(() => {
    const b = document.createElement('button');
    b.className = 'update-btn';
    document.querySelector('.topbar')!.append(b);
  });
  await expect.poll(dot).not.toBe('none');
  await toggle(page, '展開選單').click();
  await expect.poll(dot).toBe('none');
});
