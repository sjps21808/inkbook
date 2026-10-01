import type { Page } from '@playwright/test';
import { PDFDocument, rgb } from 'pdf-lib';

// 專案沒有 @types/node；setFiles 需要 Node 的 Buffer
declare const Buffer: { from(data: Uint8Array | string): Uint8Array };
export const toBuffer = (data: Uint8Array | string) => Buffer.from(data);

/** 用 pdf-lib 產生 PDF：每頁中央 20% × 20% 塗黑（用來抽樣 bg 像素） */
export async function makePdf(sizes: [number, number][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const [w, h] of sizes) {
    const p = doc.addPage([w, h]);
    p.drawRectangle({ x: w * 0.4, y: h * 0.4, width: w * 0.2, height: h * 0.2, color: rgb(0, 0, 0) });
  }
  return toBuffer(await doc.save());
}

/** 從書架點「匯入 PDF」並選擇檔案 */
export async function importPdfFile(page: Page, buffer: Uint8Array, name = '測試講義.pdf', mimeType = 'application/pdf') {
  await page.goto('./');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '匯入 PDF' }).click();
  await (await chooser).setFiles({ name, mimeType, buffer });
}
