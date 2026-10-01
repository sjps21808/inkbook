import { expect, test } from '@playwright/test';
import { inkPixel, openNewNotebook, seedPages, waitReady } from './helpers/pen';

test('300 頁筆記本從頭捲到尾不出錯', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await openNewNotebook(page, '300 頁');
  await seedPages(page, 300);

  // 每次捲一頁，等兩個 frame 讓虛擬捲動更新，記錄過程中最多掛載幾頁、配置了幾張 canvas
  const stats = await page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const stride = Number(document.querySelector<HTMLElement>('.pages')!.dataset.stride);
    const limit = Math.ceil(window.innerHeight / stride) + 1 + 4;
    let maxPages = 0;
    let maxCanvases = 0;
    let steps = 0;
    const bottom = () => document.documentElement.scrollHeight - window.innerHeight;
    while (window.scrollY < bottom() - 1) {
      window.scrollBy(0, stride);
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
