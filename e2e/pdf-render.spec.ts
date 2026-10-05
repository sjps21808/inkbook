import type { Page } from '@playwright/test';
import { bgPixel, drawStroke, elementCount, goToPage, hLine, inkPixel, waitReady } from './helpers/pen';
import { importPdfFile, makePdf } from './helpers/pdf';
import { expect, test } from './helpers/persistent';

/** 是否接近黑色（PDF 中央塗黑的方塊） */
const dark = ([r, g, b]: number[]) => r < 60 && g < 60 && b < 60;
const white = ([r, g, b]: number[]) => r > 240 && g > 240 && b > 240;

const isDark = (page: Page, pt: [number, number], index: number) => bgPixel(page, pt, index).then(dark);
const isWhite = (page: Page, pt: [number, number], index: number) => bgPixel(page, pt, index).then(white);

test('PDF 頁顯示在 bg 圖層：A4 填滿、橫向靠上、瘦長頁置中', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  // 每頁中央 20% × 20% 塗黑
  await importPdfFile(page, await makePdf([[595, 842], [842, 595], [200, 1000]]));
  for (const i of [0, 1]) await waitReady(page, i);

  // 第 1 頁 A4：中央黑、四周白
  await expect.poll(() => isDark(page, [297, 421], 0)).toBe(true);
  expect(await isWhite(page, [100, 100], 0)).toBe(true);

  // 第 2 頁橫向：縮放到 A4 寬度、靠上 → 高 420.5pt，黑塊中心在 y≈210；下方留白
  const h = (595 * 595) / 842;
  await expect.poll(() => isDark(page, [297, h / 2], 1)).toBe(true);
  expect(await isWhite(page, [297, 421], 1)).toBe(true);
  expect(await isWhite(page, [297, 700], 1)).toBe(true);

  // 第 3 頁瘦長：整頁放得下、水平置中 → 寬 168.4pt，x 在 213~381（一次只掛載目前頁前後各 1 頁，先翻過去）
  await goToPage(page, 2);
  await expect.poll(() => isDark(page, [297, 421], 2)).toBe(true);
  expect(await isWhite(page, [150, 421], 2)).toBe(true);
  expect(await isWhite(page, [450, 421], 2)).toBe(true);

  expect(errors).toEqual([]);
});

test('可以在 PDF 頁上書寫，重新開啟後 PDF 與筆跡都在', async ({ page }) => {
  await importPdfFile(page, await makePdf([[595, 842]]));
  await waitReady(page);
  await expect.poll(() => isDark(page, [297, 421], 0)).toBe(true);

  await drawStroke(page, hLine(0.2));
  await expect.poll(() => elementCount(page)).toBe(1);
  expect((await inkPixel(page, [0.5, 0.2]))[3]).toBe(255);

  await page.reload();
  await waitReady(page);
  await expect.poll(() => isDark(page, [297, 421], 0)).toBe(true);
  await expect.poll(async () => (await inkPixel(page, [0.5, 0.2]))[3]).toBe(255);
});

test('縮圖顯示 PDF 內容', async ({ page }) => {
  await importPdfFile(page, await makePdf([[595, 842], [595, 842]]));
  await waitReady(page);
  await page.getByRole('button', { name: '頁面', exact: true }).click();
  const img = page.locator('.thumb[data-thumb-index="1"] img');
  await expect(img).toHaveCount(1);
  const center = await img.evaluate(async (el: HTMLImageElement) => {
    await el.decode();
    const cv = document.createElement('canvas');
    cv.width = el.naturalWidth;
    cv.height = el.naturalHeight;
    const ctx = cv.getContext('2d')!;
    ctx.drawImage(el, 0, 0);
    const pick = (fx: number, fy: number) => [...ctx.getImageData(cv.width * fx, cv.height * fy, 1, 1).data];
    return { center: pick(0.5, 0.5), corner: pick(0.1, 0.1) };
  });
  expect(dark(center.center)).toBe(true);
  expect(white(center.corner)).toBe(true);
});
