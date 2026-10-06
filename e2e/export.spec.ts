import type { Page } from '@playwright/test';
import { PDFDict, PDFDocument, PDFName, PDFRawStream, type PDFPage } from 'pdf-lib';
import { expect, test } from './helpers/persistent';
import { importPdfFile, makePdf, toBuffer } from './helpers/pdf';
import { drawStroke, elementCount, hLine, openNewNotebook, waitReady, menuOpenByDefault } from './helpers/pen';

test.beforeEach(({ page }) => menuOpenByDefault(page));

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

// 專案沒有 @types/node；用變數動態 import 避免 tsc 解析模組型別
const nodeFs = 'node:fs/promises';
const readFile = async (path: string): Promise<Uint8Array> =>
  new Uint8Array(await (await import(/* @vite-ignore */ nodeFs)).readFile(path));

/** 記錄錯誤與 CSP 違規 */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  void page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`),
    );
    // 強制走 <a download> fallback，才能在測試裡取得檔案
    Object.defineProperty(navigator, 'canShare', { value: undefined });
  });
  return errors;
}

/** 點「匯出 PDF」→ 等產生完 →「分享／儲存」，回傳下載的檔名與內容 */
async function exportPdf(page: Page): Promise<{ name: string; bytes: Uint8Array }> {
  await button(page, '匯出 PDF').click();
  const dialog = page.getByRole('dialog', { name: '匯出 PDF' });
  await expect(dialog.getByRole('heading')).toHaveText('PDF 已準備好', { timeout: 60_000 });
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '分享／儲存' }).click();
  const d = await download;
  await expect(dialog).toHaveCount(0);
  return { name: d.suggestedFilename(), bytes: await readFile(await d.path()) };
}

/** 頁面用到的 XObject 的 Subtype */
function xobjectTypes(doc: PDFDocument, page: PDFPage): string[] {
  const xobjects = page.node.Resources()!.lookup(PDFName.of('XObject'));
  if (!(xobjects instanceof PDFDict)) return [];
  return xobjects.values().map((v) => String((doc.context.lookup(v) as PDFRawStream).dict.get(PDFName.of('Subtype'))));
}

/** 用 pdf.js 取出每頁的文字 */
async function pageTexts(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    out.push(c.items.map((it) => ('str' in it ? it.str : '')).join(''));
  }
  await doc.loadingTask.destroy();
  return out;
}

// 1×1 的 webp（PNG/JPEG 以外的格式，匯出時要經過 canvas 轉成 PNG）
const WEBP = 'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';

test('筆跡、文字、webp 圖片匯出成 PDF：頁數、文字可取出、圖片嵌入', async ({ page }) => {
  const errors = watchErrors(page);
  await openNewNotebook(page, '期末/複習');

  await drawStroke(page, hLine(0.2));
  await expect.poll(() => elementCount(page)).toBe(1);

  await button(page, '文字').click();
  await drawStroke(page, [[0.2, 0.4]]);
  await expect(page.locator('.text-el[contenteditable]')).toBeFocused();
  await page.keyboard.type('微積分 Calculus');
  await button(page, '筆').click(); // 換工具 = 結束編輯並存檔
  await expect.poll(() => elementCount(page)).toBe(2);

  const chooser = page.waitForEvent('filechooser');
  await button(page, '圖片').click();
  await (await chooser).setFiles({
    name: 'dot.webp',
    mimeType: 'image/webp',
    buffer: toBuffer(Uint8Array.from(atob(WEBP), (c) => c.charCodeAt(0))),
  });
  await expect.poll(() => elementCount(page)).toBe(3);

  const { name, bytes } = await exportPdf(page);
  expect(name).toBe('期末_複習.pdf');
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(1);
  expect(doc.getPage(0).getSize()).toEqual({ width: 595, height: 842 });
  expect(xobjectTypes(doc, doc.getPage(0))).toEqual(['/Image']);
  expect(await pageTexts(bytes)).toEqual(['微積分 Calculus']);
  expect(errors).toEqual([]);
});

test('匯入的 PDF 匯出：每頁 A4，原本的頁面以 Form XObject 嵌入', async ({ page }) => {
  const errors = watchErrors(page);
  await importPdfFile(page, await makePdf([[612, 792], [842, 595], [595, 842]]), '講義.pdf');
  await waitReady(page);
  await drawStroke(page, hLine(0.3));
  await expect.poll(() => elementCount(page)).toBe(1);

  const { name, bytes } = await exportPdf(page);
  expect(name).toBe('講義.pdf');
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(3);
  for (const p of doc.getPages()) {
    expect(p.getSize()).toEqual({ width: 595, height: 842 });
    expect(xobjectTypes(doc, p)).toEqual(['/Form']);
  }
  expect(errors).toEqual([]);
});
