import { expect, test } from '@playwright/test';
import { openNewNotebook } from './helpers/pen';

/**
 * 模擬 Pencil：240Hz 的密集取樣（點距約 0.8pt）加上 ±0.3pt 的抖動，畫一條很長的水平線（y = 421pt），
 * 再逐欄量 ink 圖層的筆跡厚度（alpha ≥ 128 的像素數）
 */
const drawNoisyLine = (page: import('@playwright/test').Page, seed: number) =>
  page.evaluate((seed) => {
    const pageEl = document.querySelector('.page[data-index="0"]')!;
    const target = pageEl.querySelector('.overlay')!;
    const r = pageEl.getBoundingClientRect();
    const k = r.width / 595;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647 - 0.5;
    };
    const pts: [number, number][] = [];
    for (let x = 60; x <= 535; x += 0.8) pts.push([x + rnd() * 0.6, 421 + rnd() * 0.6]);
    const fire = (type: string, [x, y]: [number, number]) =>
      target.dispatchEvent(
        new PointerEvent(type, { pointerType: 'pen', pointerId: 7, isPrimary: true, pressure: 0.5, clientX: r.left + x * k, clientY: r.top + y * k, bubbles: true, cancelable: true }),
      );
    fire('pointerdown', pts[0]);
    for (const p of pts.slice(1)) fire('pointermove', p);
    fire('pointerup', pts[pts.length - 1]);
  }, seed);

const thickness = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const cv = document.querySelector<HTMLCanvasElement>('.page[data-index="0"] canvas.ink')!;
    const s = cv.width / 595;
    const ctx = cv.getContext('2d')!;
    const y0 = Math.floor((421 - 10) * s);
    const h = Math.ceil(20 * s);
    // 兩端線帽附近不量
    const x0 = Math.floor(80 * s);
    const x1 = Math.floor(515 * s);
    const data = ctx.getImageData(x0, y0, x1 - x0, h).data;
    const cols: number[] = [];
    for (let x = 0; x < x1 - x0; x++) {
      let n = 0;
      for (let y = 0; y < h; y++) if (data[(y * (x1 - x0) + x) * 4 + 3] >= 128) n++;
      cols.push(n);
    }
    return { min: Math.min(...cols), max: Math.max(...cols), px: 3 * s };
  });

test('長而抖動的筆畫：各處粗細一致（最粗與最細相差不超過 1 像素）', async ({ page }) => {
  await openNewNotebook(page, '粗細', false);
  for (const seed of [7, 99, 1234]) {
    await drawNoisyLine(page, seed);
    await page.waitForTimeout(300);
    const t = await thickness(page);
    expect(t.max - t.min, JSON.stringify(t)).toBeLessThanOrEqual(1);
    expect(t.min).toBeGreaterThanOrEqual(Math.floor(t.px) - 1);
    await page.getByRole('button', { name: '復原' }).click();
    await page.waitForTimeout(200);
  }
});

test('書寫中的預覽和放開後的正式筆畫一模一樣（放開時不會跳、轉角不會缺）', async ({ page }) => {
  await openNewNotebook(page, '預覽', false);
  // 有急轉彎的鋸齒線（點距約 3pt），筆先不放開
  // 在瀏覽器裡比對（整張 canvas 的像素傳回 Node 太慢，CI 會逾時）；只比對筆畫所在的區域
  // （A4 座標 x 80～480、y 280～380；兩次 evaluate 用同一個算式）
  await page.evaluate(() => {
    const pageEl = document.querySelector('.page[data-index="0"]')!;
    const target = pageEl.querySelector('.overlay')!;
    const r = pageEl.getBoundingClientRect();
    const k = r.width / 595;
    const pts: [number, number][] = [];
    for (let i = 0; i <= 120; i++) pts.push([100 + i * 3, 300 + ((i % 20) < 10 ? i % 10 : 10 - (i % 10)) * 6]);
    const fire = (type: string, [x, y]: [number, number]) =>
      target.dispatchEvent(
        new PointerEvent(type, { pointerType: 'pen', pointerId: 7, isPrimary: true, pressure: 0.5, clientX: r.left + x * k, clientY: r.top + y * k, bubbles: true, cancelable: true }),
      );
    fire('pointerdown', pts[0]);
    for (const p of pts.slice(1)) fire('pointermove', p);
    (window as unknown as { __last: [number, number] }).__last = pts[pts.length - 1];
  });
  // 等預覽畫好
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.evaluate(() => {
    const cv = document.querySelector<HTMLCanvasElement>('.page[data-index="0"] canvas.live')!;
    const s = cv.width / 595;
    (window as unknown as { __live: Uint8ClampedArray }).__live = cv
      .getContext('2d')!
      .getImageData(Math.floor(80 * s), Math.floor(280 * s), Math.ceil(400 * s), Math.ceil(100 * s)).data;
  });
  await page.evaluate(() => {
    const pageEl = document.querySelector('.page[data-index="0"]')!;
    const r = pageEl.getBoundingClientRect();
    const k = r.width / 595;
    const [x, y] = (window as unknown as { __last: [number, number] }).__last;
    pageEl.querySelector('.overlay')!.dispatchEvent(
      new PointerEvent('pointerup', { pointerType: 'pen', pointerId: 7, isPrimary: true, clientX: r.left + x * k, clientY: r.top + y * k, bubbles: true, cancelable: true }),
    );
  });
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const cv = document.querySelector<HTMLCanvasElement>('.page[data-index="0"] canvas.ink')!;
    const s = cv.width / 595;
    const ink = cv
      .getContext('2d')!
      .getImageData(Math.floor(80 * s), Math.floor(280 * s), Math.ceil(400 * s), Math.ceil(100 * s)).data;
    const live = (window as unknown as { __live: Uint8ClampedArray }).__live;
    let painted = 0;
    let diff = 0;
    for (let i = 3; i < ink.length; i += 4) {
      if (ink[i] > 0) painted++;
      if (Math.abs(ink[i] - live[i]) > 2) diff++;
    }
    return { same: ink.length === live.length, painted, diff };
  });
  expect(r.same).toBe(true);
  expect(r.painted).toBeGreaterThan(1000);
  expect(r.diff).toBe(0);
});
