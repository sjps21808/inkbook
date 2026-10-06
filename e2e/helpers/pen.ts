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

/** 點顏色圓圈打開色盤，選一個顏色 */
export async function pickColor(page: Page, name: string) {
  await page.getByRole('button', { name: /^顏色：/ }).click();
  await page.getByRole('group', { name: '選擇顏色' }).getByRole('button', { name, exact: true }).click();
}

/**
 * 讓這個測試裡開啟的筆記本一律展開大選單（自行建立筆記本、匯入 PDF 的測試用；
 * 預設收起的行為由 chrome.spec 驗證）
 */
export async function menuOpenByDefault(page: Page) {
  await page.addInitScript(() => localStorage.setItem('inkbook.toolbarCollapsed', '0'));
}

/** 大選單收起時把它展開（展開狀態會記住，重新整理後維持） */
export async function openMenu(page: Page) {
  const toggle = page.getByRole('button', { name: '展開選單', exact: true });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole('button', { name: '收起選單', exact: true }).waitFor();
}

/**
 * 從書架新增一本筆記本並開啟。
 * 大選單預設收起；多數測試要用到大選單裡的按鈕，所以預設把它展開（menu = false 維持預設）
 */
export async function openNewNotebook(page: Page, title = '測試筆記', menu = true) {
  await page.goto('./');
  await page.getByRole('button', { name: '新增筆記本' }).click();
  await page.getByLabel('筆記本標題').fill(title);
  await page.getByRole('button', { name: '建立' }).click();
  await waitReady(page);
  if (menu) await openMenu(page);
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

/** 用縮圖側欄翻到第 index 頁，並等它載入完成（側欄維持原本的開關狀態） */
export async function goToPage(page: Page, index: number) {
  const sidebar = page.getByRole('button', { name: '頁面', exact: true });
  const wasOpen = await page.locator('.thumbnails').isVisible();
  if (!wasOpen) await sidebar.click();
  await page.getByRole('button', { name: `第 ${index + 1} 頁`, exact: true }).click();
  if (!wasOpen) await sidebar.click();
  await page.locator(`.pages[data-current="${index}"]`).waitFor();
  await waitReady(page, index);
}

/** 用合成 PointerEvent 模擬手指在目前頁上左右滑動：dir = 1 往左滑（下一頁）、-1 往右滑（上一頁） */
export async function swipe(page: Page, dir: 1 | -1) {
  await page.evaluate((dir) => {
    const cur = document.querySelector<HTMLElement>('.pages')!.dataset.current;
    const target = document.querySelector(`.page[data-index="${cur}"] .overlay`)!;
    const r = target.getBoundingClientRect();
    const y = r.top + r.height / 2;
    const [x0, x1] = dir === 1 ? [0.8, 0.2] : [0.2, 0.8];
    const fire = (type: string, fx: number) =>
      target.dispatchEvent(
        new PointerEvent(type, {
          pointerType: 'touch',
          pointerId: 11,
          isPrimary: true,
          clientX: r.left + fx * r.width,
          clientY: y,
          bubbles: true,
          cancelable: true,
        }),
      );
    fire('pointerdown', x0);
    fire('pointermove', (x0 + x1) / 2);
    fire('pointerup', x1);
  }, dir);
}

/** 目前顯示的頁面 index */
export async function currentPage(page: Page) {
  return Number(await page.locator('.pages').getAttribute('data-current'));
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
