import { expect, test, type Page } from '@playwright/test';
import {
  drawStroke,
  elementCount,
  hLine,
  inkPixel,
  mountedPages,
  openNewNotebook,
  scrollToPage,
  seedPages,
  waitReady,
} from './helpers/pen';

/** 可見頁數 + 前後各 2 頁 */
const maxMounted = (page: Page) =>
  page.evaluate(() => {
    const stride = Number(document.querySelector<HTMLElement>('.pages')!.dataset.stride);
    return Math.ceil(window.innerHeight / stride) + 1 + 4;
  });

test.beforeEach(async ({ page }) => {
  await openNewNotebook(page);
  await seedPages(page, 20);
});

test('虛擬捲動：DOM 只保留可見頁前後各 2 頁', async ({ page }) => {
  const limit = await maxMounted(page);
  let mounted = await mountedPages(page);
  expect(mounted[0]).toBe(0);
  expect(mounted.length).toBeLessThanOrEqual(limit);
  expect(mounted.length).toBeLessThan(20);

  await scrollToPage(page, 19);
  mounted = await mountedPages(page);
  expect(mounted).toContain(19);
  expect(mounted).not.toContain(0);
  expect(mounted.length).toBeLessThanOrEqual(limit);
  // 已存在的筆畫（seed）有畫出來
  await expect.poll(async () => (await inkPixel(page, [0.5, 0.5], 19))[3]).toBe(255);
});

test('在第 3 頁書寫，捲走再捲回來筆畫還在；undo 時捲回第 3 頁', async ({ page }) => {
  await scrollToPage(page, 2);
  await drawStroke(page, hLine(0.3), 'pen', 2);
  await expect.poll(() => elementCount(page)).toBe(20);

  await scrollToPage(page, 19);
  expect(await mountedPages(page)).not.toContain(2);
  await scrollToPage(page, 0);
  await scrollToPage(page, 2);
  await expect.poll(async () => (await inkPixel(page, [0.5, 0.3], 2))[3]).toBe(255);

  await scrollToPage(page, 19);
  await page.getByRole('button', { name: '復原' }).click();
  await waitReady(page, 2);
  const inView = await page.evaluate(() => {
    const r = document.querySelector('.page[data-index="2"]')!.getBoundingClientRect();
    return r.top < window.innerHeight && r.bottom > 0;
  });
  expect(inView).toBe(true);
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
