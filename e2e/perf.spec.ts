import { expect, test } from '@playwright/test';
import { inkPixel, openNewNotebook, seedPages, waitReady } from './helpers/pen';

test('300 頁筆記本從第一頁翻到最後一頁不出錯', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await openNewNotebook(page, '300 頁');
  await seedPages(page, 300);

  // 每次用手指往左滑翻一頁，等兩個 frame 讓 DOM 更新，記錄過程中最多掛載幾頁、配置了幾張 canvas
  const stats = await page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const pages = document.querySelector<HTMLElement>('.pages')!;
    // 目前頁 + 前後各 1 頁
    const limit = 3;
    let maxPages = 0;
    let maxCanvases = 0;
    let steps = 0;
    const swipeLeft = () => {
      const target = document.querySelector(`.page[data-index="${pages.dataset.current}"] .overlay`)!;
      const r = target.getBoundingClientRect();
      const fire = (type: string, fx: number) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerType: 'touch',
            pointerId: 11,
            isPrimary: true,
            clientX: r.left + fx * r.width,
            clientY: r.top + r.height / 2,
            bubbles: true,
            cancelable: true,
          }),
        );
      fire('pointerdown', 0.8);
      fire('pointermove', 0.5);
      fire('pointerup', 0.2);
    };
    while (Number(pages.dataset.current) < 299 && steps < 400) {
      swipeLeft();
      await frame();
      await frame();
      steps++;
      maxPages = Math.max(maxPages, document.querySelectorAll('.page').length);
      maxCanvases = Math.max(
        maxCanvases,
        [...document.querySelectorAll('canvas')].filter((c) => c.width > 0).length,
      );
    }
    return { limit, maxPages, maxCanvases, steps };
  });

  expect(stats.steps).toBeGreaterThan(250);
  expect(stats.maxPages).toBeLessThanOrEqual(stats.limit);
  // 每頁 bg + ink，加上最多一張 live
  expect(stats.maxCanvases).toBeLessThanOrEqual(stats.limit * 2 + 1);

  await waitReady(page, 299);
  await expect.poll(async () => (await inkPixel(page, [0.5, 0.5], 299))[3]).toBe(255);
  expect(errors).toEqual([]);
});
