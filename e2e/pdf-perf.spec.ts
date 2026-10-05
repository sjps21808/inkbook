import { bgPixel, goToPage, pageCount, waitReady } from './helpers/pen';
import { makePdf } from './helpers/pdf';
import { expect, test } from './helpers/persistent';

// 實測（Windows 本機 Playwright WebKit）：每個 IndexedDB 請求固定約 15ms，500 頁的 Page 寫入就佔約 7.7 秒，
// pdf.js 讀取頁數與尺寸約 0.3 秒。CI（ubuntu）與 iPad 預期不受這個限制（未驗證）
test('500 頁 PDF 在 10 秒內匯入完成，最後一頁可以顯示', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  const pdf = await makePdf(Array.from({ length: 500 }, () => [595, 842] as [number, number]));
  await page.goto('./');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '匯入 PDF' }).click();
  const fc = await chooser;

  const t0 = Date.now();
  await fc.setFiles({ name: '500 頁.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.locator('.nb-title')).toHaveText('500 頁', { timeout: 10_000 });
  await waitReady(page);
  const elapsed = Date.now() - t0;
  console.log(`匯入 500 頁 PDF：${elapsed} ms`);
  expect(elapsed).toBeLessThan(10_000);
  expect(await pageCount(page)).toBe(500);

  await goToPage(page, 499);
  await expect.poll(async () => (await bgPixel(page, [297, 421], 499))[0]).toBeLessThan(60);
  expect(errors).toEqual([]);
});
