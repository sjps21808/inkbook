import { PDFDocument } from 'pdf-lib';
import { drawStroke, elementCount, hLine, waitReady } from './helpers/pen';
import { makePdf } from './helpers/pdf';
import { expect, test } from './helpers/persistent';

// 專案沒有 @types/node；用變數動態 import 避免 tsc 解析模組型別
const nodeFs = 'node:fs/promises';
const readFile = async (path: string): Promise<Uint8Array> =>
  new Uint8Array(await (await import(/* @vite-ignore */ nodeFs)).readFile(path));

// 規格沒有訂匯出的時間上限：只確認 500 頁能完成、不出錯，並記錄耗時（放在 perf project 單獨執行）
test('500 頁 PDF 筆記本可以匯出，頁數正確', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(() => Object.defineProperty(navigator, 'canShare', { value: undefined }));

  const pdf = await makePdf(Array.from({ length: 500 }, () => [595, 842] as [number, number]));
  await page.goto('./');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '匯入 PDF' }).click();
  await (await chooser).setFiles({ name: '500 頁.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.locator('.nb-title')).toHaveText('500 頁', { timeout: 30_000 });
  await waitReady(page);
  await drawStroke(page, hLine(0.3));
  await expect.poll(() => elementCount(page)).toBe(1);

  const t0 = Date.now();
  await page.getByRole('button', { name: '匯出 PDF', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '匯出 PDF' });
  await expect(dialog.getByRole('heading')).toHaveText('PDF 已準備好', { timeout: 240_000 });
  console.log(`匯出 500 頁 PDF：${Date.now() - t0} ms`);

  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '分享／儲存' }).click();
  const doc = await PDFDocument.load(await readFile(await (await download).path()));
  expect(doc.getPageCount()).toBe(500);
  expect(errors).toEqual([]);
});
