import { expect, test, type Page } from '@playwright/test';
import { currentPage, drawStroke, elementCount, hLine, openNewNotebook, seedPages, waitReady } from './helpers/pen';

/** 合成 touch pointer 事件（模擬手指），座標是畫面上的 px */
const touches = (page: Page, events: { type: string; id: number; x: number; y: number }[]) =>
  page.evaluate((events) => {
    const target = document.querySelector('.pages')!;
    for (const e of events)
      target.dispatchEvent(
        new PointerEvent(e.type, { pointerType: 'touch', pointerId: e.id, clientX: e.x, clientY: e.y, bubbles: true }),
      );
  }, events);

const rect = (page: Page, selector: string) =>
  page.evaluate((s) => {
    const r = document.querySelector(s)!.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, selector);

/** 以 (cx, cy) 為中心雙指縮放：兩指距離從 d0 變成 d1 */
async function pinch(page: Page, cx: number, cy: number, d0: number, d1: number) {
  await touches(page, [
    { type: 'pointerdown', id: 31, x: cx - d0 / 2, y: cy },
    { type: 'pointerdown', id: 32, x: cx + d0 / 2, y: cy },
  ]);
  for (let i = 1; i <= 4; i++) {
    const d = d0 + ((d1 - d0) * i) / 4;
    await touches(page, [
      { type: 'pointermove', id: 31, x: cx - d / 2, y: cy },
      { type: 'pointermove', id: 32, x: cx + d / 2, y: cy },
    ]);
  }
  await touches(page, [
    { type: 'pointerup', id: 31, x: cx - d1 / 2, y: cy },
    { type: 'pointerup', id: 32, x: cx + d1 / 2, y: cy },
  ]);
}

const slot = '.page-slot[data-slot="0"]';

test.beforeEach(async ({ page }) => {
  await openNewNotebook(page);
});

test('雙指放大 2 倍：只有白紙變大，選單、色盤位置與大小都不變', async ({ page }) => {
  const page0 = await rect(page, slot);
  const bar = await rect(page, '.quickbar');
  const band = await rect(page, '.top-band');
  const menu = await rect(page, '.toolbar');

  const cx = page0.x + page0.w / 2;
  const cy = page0.y + page0.h / 2;
  await pinch(page, cx, cy, 100, 200);
  await expect.poll(async () => (await rect(page, slot)).w).toBeCloseTo(page0.w * 2, 0);
  // 以兩指中點為錨點：中點下的那一點沒有移動（放大後中心仍在 cx）
  const z = await rect(page, slot);
  expect(z.x + z.w / 2).toBeCloseTo(cx, 0);

  expect(await rect(page, '.quickbar')).toEqual(bar);
  expect(await rect(page, '.top-band')).toEqual(band);
  expect(await rect(page, '.toolbar')).toEqual(menu);
  await page.getByRole('button', { name: /^顏色：/ }).click();
  expect((await rect(page, '.color-grid .swatch')).w).toBeCloseTo(36, 0);
});

test('縮到 1x 以下放開會彈回 1x；最大 4x', async ({ page }) => {
  const page0 = await rect(page, slot);
  const cx = page0.x + page0.w / 2;
  const cy = page0.y + page0.h / 2;
  await pinch(page, cx, cy, 200, 100);
  await expect.poll(async () => (await rect(page, slot)).w).toBeCloseTo(page0.w, 0);
  expect((await rect(page, slot)).x).toBeCloseTo(page0.x, 0);

  await pinch(page, cx, cy, 50, 400);
  await expect.poll(async () => (await rect(page, slot)).w).toBeCloseTo(page0.w * 4, 0);
});

test('放大時單指拖動是平移白紙、不翻頁；白紙邊緣不會被拖進畫面', async ({ page }) => {
  await seedPages(page, 3);
  const page0 = await rect(page, slot);
  await pinch(page, page0.x + page0.w / 2, page0.y + page0.h / 2, 100, 300);
  await expect.poll(async () => (await rect(page, slot)).w).toBeCloseTo(page0.w * 3, 0);
  const before = await rect(page, slot);

  // 往左拖 100px：白紙跟著移動，沒有翻頁
  await touches(page, [
    { type: 'pointerdown', id: 41, x: 500, y: 600 },
    { type: 'pointermove', id: 41, x: 450, y: 600 },
    { type: 'pointermove', id: 41, x: 400, y: 600 },
    { type: 'pointerup', id: 41, x: 400, y: 600 },
  ]);
  expect((await rect(page, slot)).x).toBeCloseTo(before.x - 100, 0);
  expect(await currentPage(page)).toBe(0);

  // 往右拖很遠：左邊緣停在畫面左側 16px，不會露出灰底
  await touches(page, [
    { type: 'pointerdown', id: 42, x: 100, y: 600 },
    { type: 'pointermove', id: 42, x: 3000, y: 600 },
    { type: 'pointerup', id: 42, x: 3000, y: 600 },
  ]);
  expect((await rect(page, slot)).x).toBeCloseTo(16, 0);
});

test('放大時用 Pencil 寫字，座標對應到白紙上正確的位置', async ({ page }) => {
  const page0 = await rect(page, slot);
  await pinch(page, page0.x + page0.w / 2, page0.y + page0.h / 2, 100, 200);
  await expect.poll(async () => (await rect(page, slot)).w).toBeCloseTo(page0.w * 2, 0);
  // drawStroke 用白紙目前的位置換算：畫在白紙中央那條水平線
  await drawStroke(page, hLine(0.5, 0.4, 0.6));
  await expect.poll(() => elementCount(page)).toBe(1);
  const xs = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const req = indexedDB.open('inkbook');
        req.onsuccess = () => {
          const q = req.result.transaction('elements').objectStore('elements').getAll();
          q.onsuccess = () => {
            const p = (q.result[0] as { points: Float32Array }).points;
            resolve([p[0], p[1], p[p.length - 3]]);
            req.result.close();
          };
        };
      }),
  );
  // A4 座標：x 從 0.4×595 到 0.6×595、y = 0.5×842
  expect(xs[0]).toBeCloseTo(238, 0);
  expect(xs[1]).toBeCloseTo(421, 0);
  expect(xs[2]).toBeCloseTo(357, 0);
});

test('放開後依倍率重繪：canvas 解析度變高（有上限），縮回 1x 再變回原本', async ({ page }) => {
  const width = () => page.evaluate(() => document.querySelector<HTMLCanvasElement>('.page[data-index="0"] canvas.ink')!.width);
  const w1 = await width();
  const page0 = await rect(page, slot);
  await pinch(page, page0.x + page0.w / 2, page0.y + page0.h / 2, 100, 200);
  await expect.poll(width).toBeGreaterThan(w1 * 1.8);
  const h = await page.evaluate(() => document.querySelector<HTMLCanvasElement>('.page[data-index="0"] canvas.ink')!.height);
  expect(h).toBeLessThanOrEqual(4096);
  await pinch(page, page0.x + page0.w / 2, page0.y + page0.h / 2, 200, 100);
  await expect.poll(width).toBe(w1);
});

test('翻到別頁時回到 1x', async ({ page }) => {
  await seedPages(page, 2);
  const page0 = await rect(page, slot);
  await pinch(page, page0.x + page0.w / 2, page0.y + page0.h / 2, 100, 200);
  await expect.poll(async () => (await rect(page, slot)).w).toBeCloseTo(page0.w * 2, 0);
  await page.getByRole('button', { name: '下一頁' }).click();
  await waitReady(page, 1);
  await page.getByRole('button', { name: '上一頁' }).click();
  await expect.poll(async () => (await rect(page, slot)).w).toBeCloseTo(page0.w, 0);
});

test('擋掉 Safari 的整頁縮放手勢', async ({ page }) => {
  const prevented = await page.evaluate(() => {
    const e = new Event('gesturestart', { cancelable: true });
    document.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(prevented).toBe(true);
});
