import { expect, test } from '@playwright/test';
import { drawStroke, elementCount, hLine, inkPixel, openNewNotebook } from './helpers/pen';

test.beforeEach(async ({ page }) => {
  await openNewNotebook(page);
});

test('Pencil 畫一筆會出現在 ink 圖層', async ({ page }) => {
  expect((await inkPixel(page, [0.5, 0.3]))[3]).toBe(0);
  await drawStroke(page, hLine(0.3));
  const [r, g, b, a] = await inkPixel(page, [0.5, 0.3]);
  expect(a).toBe(255);
  expect(Math.max(r, g, b)).toBeLessThan(60); // 預設黑色
  expect((await inkPixel(page, [0.5, 0.6]))[3]).toBe(0);
});

test('pointerup 時存檔，重新整理後筆畫還在', async ({ page }) => {
  await drawStroke(page, hLine(0.3));
  await expect.poll(() => elementCount(page)).toBe(1);
  await page.reload();
  await expect(page.locator('.page canvas.ink')).toBeVisible();
  await expect.poll(async () => (await inkPixel(page, [0.5, 0.3]))[3]).toBe(255);
});

test('手指（touch）不會畫出線', async ({ page }) => {
  await drawStroke(page, hLine(0.3), 'touch');
  expect((await inkPixel(page, [0.5, 0.3]))[3]).toBe(0);
  expect(await elementCount(page)).toBe(0);
});

test('正式版中滑鼠不會畫出線（只有 DEV 把滑鼠當筆）', async ({ page }) => {
  await drawStroke(page, hLine(0.3), 'mouse');
  expect((await inkPixel(page, [0.5, 0.3]))[3]).toBe(0);
});

test('canvas 解析度依 devicePixelRatio，且單邊不超過 4096', async ({ page }) => {
  const size = await page.evaluate(() => {
    const cv = document.querySelector<HTMLCanvasElement>('.page canvas.ink')!;
    return { w: cv.width, h: cv.height, cssW: cv.getBoundingClientRect().width, dpr: devicePixelRatio };
  });
  expect(size.h).toBeLessThanOrEqual(4096);
  expect(size.w).toBeCloseTo(Math.min(size.cssW * size.dpr, (4096 * 595) / 842), -1);
});
