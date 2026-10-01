import type { Page } from '@playwright/test';

/** 頁面上的相對位置（0~1） */
export type Pt = [number, number];

/** 用合成 PointerEvent 在第 index 頁畫一筆（模擬 Apple Pencil） */
export async function drawStroke(page: Page, pts: Pt[], pointerType = 'pen', index = 0) {
  await page.evaluate(
    ({ pts, pointerType, index }) => {
      const pageEl = document.querySelector(`.page[data-index="${index}"]`)!;
      const target = pageEl.querySelector('.overlay')!;
      const r = pageEl.getBoundingClientRect();
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
    { pts, pointerType, index },
  );
}

/** 一條水平線 */
export const hLine = (y: number, x0 = 0.2, x1 = 0.8): Pt[] =>
  Array.from({ length: 13 }, (_, i) => [x0 + ((x1 - x0) * i) / 12, y]);

/** 讀取第 index 頁 ink 圖層某個相對位置的像素 [r, g, b, a] */
export function inkPixel(page: Page, [fx, fy]: Pt, index = 0) {
  return page.evaluate(
    ({ fx, fy, index }) => {
      const cv = document.querySelector<HTMLCanvasElement>(`.page[data-index="${index}"] canvas.ink`)!;
      const d = cv.getContext('2d')!.getImageData(Math.floor(fx * cv.width), Math.floor(fy * cv.height), 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    },
    { fx, fy, index },
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
  await waitReady(page);
}

/** 等第 index 頁的 element 載入完成（之後才能書寫） */
export async function waitReady(page: Page, index = 0) {
  await page.locator(`.page[data-index="${index}"][data-ready]`).waitFor();
}

/**
 * 直接寫入 IndexedDB，讓目前開啟的筆記本總共有 total 頁，
 * 並在每頁（第 1 頁除外）y = 0.5 畫一條橫線；完成後重新載入。
 */
export async function seedPages(page: Page, total: number) {
  await page.evaluate(async (total) => {
    const notebookId = decodeURIComponent(location.hash.split('/')[2]);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('inkbook');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(['pages', 'elements'], 'readwrite');
    for (let i = 1; i < total; i++) {
      const pageId = `seed-${i}`;
      tx.objectStore('pages').put({ id: pageId, notebookId, order: i, template: 'blank' });
      const pts: number[] = [];
      for (let x = 100; x <= 500; x += 20) pts.push(x, 421, 0.5);
      tx.objectStore('elements').put({
        id: `seed-el-${i}`,
        pageId,
        z: 0,
        type: 'stroke',
        tool: 'pen',
        color: '#1c1c1e',
        width: 3,
        points: new Float32Array(pts),
      });
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, total);
  await page.reload();
  await waitReady(page);
}

/** 捲到第 index 頁（頁頂對齊工具列下緣），並等它載入完成 */
export async function scrollToPage(page: Page, index: number) {
  await page.evaluate((index) => {
    const c = document.querySelector<HTMLElement>('.pages')!;
    const stride = Number(c.dataset.stride);
    const toolbar = document.querySelector('.toolbar')!.getBoundingClientRect().bottom;
    window.scrollTo(0, window.scrollY + c.getBoundingClientRect().top + index * stride - toolbar);
  }, index);
  await waitReady(page, index);
}

/** 目前 DOM 中的頁面 index */
export function mountedPages(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.page')].map((p) => Number(p.dataset.index)),
  );
}

/** IndexedDB 裡的頁面數量 */
export function pageCount(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open('inkbook');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const c = db.transaction('pages').objectStore('pages').count();
          c.onsuccess = () => {
            resolve(c.result);
            db.close();
          };
        };
      }),
  );
}

/** 讀取第 index 頁 bg 圖層（模板）的像素 [r, g, b, a]；座標單位 pt */
export function bgPixel(page: Page, [x, y]: Pt, index = 0) {
  return page.evaluate(
    ({ x, y, index }) => {
      const cv = document.querySelector<HTMLCanvasElement>(`.page[data-index="${index}"] canvas.bg`)!;
      const k = cv.width / 595;
      const d = cv.getContext('2d')!.getImageData(Math.floor(x * k), Math.floor(y * k), 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    },
    { x, y, index },
  );
}
