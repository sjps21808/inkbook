import { expect, test } from '@playwright/test';
import {
  drawStroke,
  elementCount,
  hLine,
  inkPixel,
  goToPage,
  mountedPages,
  openNewNotebook,
  seedPages,
  waitReady,
} from './helpers/pen';

/** 目前頁 + 前後各 1 頁 */
const MAX_MOUNTED = 3;

test.beforeEach(async ({ page }) => {
  await openNewNotebook(page);
  await seedPages(page, 20);
});

test('DOM 只保留目前頁前後各 1 頁', async ({ page }) => {
  let mounted = await mountedPages(page);
  expect(mounted[0]).toBe(0);
  expect(mounted.length).toBeLessThanOrEqual(MAX_MOUNTED);
  expect(mounted.length).toBeLessThan(20);

  await goToPage(page, 19);
  mounted = await mountedPages(page);
  expect(mounted).toContain(19);
  expect(mounted).not.toContain(0);
  expect(mounted.length).toBeLessThanOrEqual(MAX_MOUNTED);
  // 已存在的筆畫（seed）有畫出來
  await expect.poll(async () => (await inkPixel(page, [0.5, 0.5], 19))[3]).toBe(255);
});

test('在第 3 頁書寫，翻走再翻回來筆畫還在；undo 時翻回第 3 頁', async ({ page }) => {
  await goToPage(page, 2);
  await drawStroke(page, hLine(0.3), 'pen', 2);
  await expect.poll(() => elementCount(page)).toBe(20);

  await goToPage(page, 19);
  expect(await mountedPages(page)).not.toContain(2);
  await goToPage(page, 0);
  await goToPage(page, 2);
  await expect.poll(async () => (await inkPixel(page, [0.5, 0.3], 2))[3]).toBe(255);

  await goToPage(page, 19);
  await page.getByRole('button', { name: '復原' }).click();
  await waitReady(page, 2);
  await expect(page.locator('.pages')).toHaveAttribute('data-current', '2');
  // 翻頁動畫結束後第 3 頁完整在畫面內
  await expect
    .poll(() =>
      page.evaluate(() => {
        const r = document.querySelector('.page[data-index="2"]')!.getBoundingClientRect();
        return r.left >= 0 && r.right <= document.documentElement.clientWidth;
      }),
    )
    .toBe(true);
  await expect.poll(async () => (await inkPixel(page, [0.5, 0.3], 2))[3]).toBe(0);
  await expect.poll(() => elementCount(page)).toBe(19);
});

test('同時只有一張 live canvas 佔用記憶體', async ({ page }) => {
  await drawStroke(page, hLine(0.3), 'pen', 0);
  await drawStroke(page, hLine(0.3), 'pen', 1);
  const allocated = await page.evaluate(
    () => [...document.querySelectorAll<HTMLCanvasElement>('canvas.live')].filter((c) => c.width > 0).length,
  );
  expect(allocated).toBe(1);
});
