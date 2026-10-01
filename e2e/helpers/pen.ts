import type { Page } from '@playwright/test';

/** 頁面上的相對位置（0~1） */
export type Pt = [number, number];

/** 用合成 PointerEvent 在頁面上畫一筆（模擬 Apple Pencil） */
export async function drawStroke(page: Page, pts: Pt[], pointerType = 'pen') {
  await page.evaluate(
    ({ pts, pointerType }) => {
      const target = document.querySelector('.page .overlay')!;
      const r = document.querySelector('.page')!.getBoundingClientRect();
      const fire = (type: string, [fx, fy]: [number, number]) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerType,
            pointerId: 7,
            isPrimary: true,
            pressure: 0.5,
            clientX: r.left + fx * r.width,
            clientY: r.top + fy * r.height,
            bubbles: true,
            cancelable: true,
          }),
        );
      fire('pointerdown', pts[0]);
      for (const p of pts.slice(1)) fire('pointermove', p);
      fire('pointerup', pts[pts.length - 1]);
    },
    { pts, pointerType },
  );
}

/** 一條水平線 */
export const hLine = (y: number, x0 = 0.2, x1 = 0.8): Pt[] =>
  Array.from({ length: 13 }, (_, i) => [x0 + ((x1 - x0) * i) / 12, y]);

/** 讀取 ink 圖層某個相對位置的像素 [r, g, b, a] */
export function inkPixel(page: Page, [fx, fy]: Pt) {
  return page.evaluate(
    ([fx, fy]) => {
      const cv = document.querySelector<HTMLCanvasElement>('.page canvas.ink')!;
      const d = cv.getContext('2d')!.getImageData(Math.floor(fx * cv.width), Math.floor(fy * cv.height), 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    },
    [fx, fy] as Pt,
  );
}

/** IndexedDB 裡 element 的數量 */
export function elementCount(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open('inkbook');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const c = db.transaction('elements').objectStore('elements').count();
          c.onsuccess = () => {
            resolve(c.result);
            db.close();
          };
        };
      }),
  );
}

/** 從書架新增一本筆記本並開啟 */
export async function openNewNotebook(page: Page, title = '測試筆記') {
  await page.goto('./');
  await page.getByRole('button', { name: '新增筆記本' }).click();
  await page.getByLabel('筆記本標題').fill(title);
  await page.getByRole('button', { name: '建立' }).click();
  await page.locator('.page canvas.ink').waitFor();
}
