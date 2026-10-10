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
