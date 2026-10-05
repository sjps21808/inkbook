import { expect, test } from '@playwright/test';
import { openNewNotebook } from './helpers/pen';

const slotSize = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const r = document.querySelector('.page-slot')!.getBoundingClientRect();
    return { w: r.width, h: r.height, vh: document.documentElement.clientHeight };
  });

test('直向：整頁高度在螢幕內', async ({ page }) => {
  await openNewNotebook(page);
  const s = await slotSize(page);
  expect(s.h).toBeLessThanOrEqual(s.vh - 32);
});

test('橫向：頁面縮小到整頁放得進螢幕，旋轉回直向後恢復', async ({ page }) => {
  await openNewNotebook(page);
  const portrait = await slotSize(page);
  const { width, height } = page.viewportSize()!;
  await page.setViewportSize({ width: height, height: width });
  await expect.poll(async () => (await slotSize(page)).h).toBeLessThanOrEqual(width - 32);
  const land = await slotSize(page);
  expect(land.h).toBeGreaterThan(width - 34);
  expect(land.w / land.h).toBeCloseTo(595 / 842, 2);
  await page.setViewportSize({ width, height });
  await expect.poll(async () => (await slotSize(page)).w).toBeCloseTo(portrait.w);
});
