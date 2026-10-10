import { expect, test } from '@playwright/test';
import { elementCount, openNewNotebook } from './helpers/pen';

/** IndexedDB 裡唯一一筆筆畫的點（x, y 成對） */
const storedPoints = (page: import('@playwright/test').Page) =>
  page.evaluate(
    () =>
      new Promise<[number, number][]>((resolve) => {
        const req = indexedDB.open('inkbook');
        req.onsuccess = () => {
          const q = req.result.transaction('elements').objectStore('elements').getAll();
          q.onsuccess = () => {
            const p = (q.result[0] as { points: Float32Array }).points;
            const out: [number, number][] = [];
            for (let i = 0; i < p.length; i += 3) out.push([p[i], p[i + 1]]);
            resolve(out);
            req.result.close();
          };
        };
      }),
  );

test('Safari 重送合併事件（每批 4 點送兩次）：存下來的點不重複、不往回跳', async ({ page }) => {
  await openNewNotebook(page, '合併事件', false);
  await page.evaluate(() => {
    const pageEl = document.querySelector('.page[data-index="0"]')!;
    const target = pageEl.querySelector('.overlay')!;
    const r = pageEl.getBoundingClientRect();
    const k = r.width / 595;
    const t0 = performance.now();
    // 第 i 個點：A4 座標 (100 + 10i, 400)，時間 t0 + 4i
    const ev = (type: string, i: number) => {
      const e = new PointerEvent(type, {
        pointerType: 'pen',
        pointerId: 7,
        isPrimary: true,
        pressure: 0.5,
        clientX: r.left + (100 + 10 * i) * k,
        clientY: r.top + 400 * k,
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(e, 'timeStamp', { value: t0 + 4 * i });
      return e;
    };
    target.dispatchEvent(ev('pointerdown', 0));
    // 4 批（點 1～4、5～8、9～12、13～16），每批的 pointermove 送兩次、合併清單都一樣
    for (let b = 0; b < 4; b++) {
      const batch = [1, 2, 3, 4].map((j) => ev('pointermove', b * 4 + j));
      for (let rep = 0; rep < 2; rep++) {
        const main = ev('pointermove', b * 4 + 4);
        Object.defineProperty(main, 'getCoalescedEvents', { value: () => batch });
        target.dispatchEvent(main);
      }
    }
    target.dispatchEvent(ev('pointerup', 16));
  });
  await expect.poll(() => elementCount(page)).toBe(1);
  const pts = await storedPoints(page);
  // 0～16 共 17 個點，一路往右、沒有重複
  expect(pts).toHaveLength(17);
  for (let i = 0; i < pts.length; i++) expect(pts[i][0]).toBeCloseTo(100 + 10 * i, 1);
});
