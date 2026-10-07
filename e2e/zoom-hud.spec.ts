import { expect, test, type Page } from '@playwright/test';
import { openNewNotebook } from './helpers/pen';

/** 模擬雙指放大：visualViewport 的倍率與位移改掉，並送出 resize（Playwright 沒辦法真的雙指縮放） */
const zoom = (page: Page, scale: number, x: number, y: number) =>
  page.evaluate(
    ({ scale, x, y }) => {
      const vv = window.visualViewport!;
      Object.defineProperty(vv, 'scale', { configurable: true, get: () => scale });
      Object.defineProperty(vv, 'offsetLeft', { configurable: true, get: () => x });
      Object.defineProperty(vv, 'offsetTop', { configurable: true, get: () => y });
      vv.dispatchEvent(new Event('resize'));
    },
    { scale, x, y },
  );

const rect = (page: Page, selector: string) =>
  page.evaluate((s) => {
    const r = document.querySelector(s)!.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, selector);

test.beforeEach(async ({ page }) => {
  await openNewNotebook(page);
});

test('放大 2 倍：浮動列與大選單縮回原本大小，並移到看得到的區域', async ({ page }) => {
  await expect(page.getByRole('toolbar', { name: '工具列' })).toBeVisible();
  const bar = await rect(page, '.quickbar');
  const menu = await rect(page, '.toolbar');
  await zoom(page, 2, 100, 200);

  // 版面座標裡：寬高變一半、位置 = 可見區域左上角 + 原本位置 / 2（放大 2 倍後在螢幕上就是原本的大小與位置）
  await expect.poll(() => rect(page, '.quickbar')).toEqual({
    x: expect.closeTo(100 + bar.x / 2, 0),
    y: expect.closeTo(200 + bar.y / 2, 0),
    w: expect.closeTo(bar.w / 2, 0),
    h: expect.closeTo(bar.h / 2, 0),
  });
  expect((await rect(page, '.toolbar')).w).toBeCloseTo(menu.w / 2, 0);

  // 頂端列（在 App 的 .hud 裡）也一樣
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.app-hud')!).transform)).toBe(
    'matrix(0.5, 0, 0, 0.5, 100, 200)',
  );

  // 縮回原本倍率
  await zoom(page, 1, 0, 0);
  await expect.poll(() => rect(page, '.quickbar')).toEqual({
    x: expect.closeTo(bar.x, 0),
    y: expect.closeTo(bar.y, 0),
    w: expect.closeTo(bar.w, 0),
    h: expect.closeTo(bar.h, 0),
  });
});

test('放大時打開的色盤、縮圖側欄、對話框也維持原本大小', async ({ page }) => {
  await page.getByRole('button', { name: '頁面', exact: true }).click();
  const sidebarW = (await rect(page, '.thumbnails')).w;
  await page.getByRole('button', { name: '頁面', exact: true }).click();
  await zoom(page, 2, 50, 80);
  await page.getByRole('button', { name: /^顏色：/ }).click();
  expect((await rect(page, '.color-grid .swatch')).w).toBeCloseTo(36 / 2, 0);
  await page.mouse.click(400, 900); // 點外面關閉色盤

  await page.getByRole('button', { name: '頁面', exact: true }).click();
  expect((await rect(page, '.thumbnails')).w).toBeCloseTo(sidebarW / 2, 0);
  // 側欄貼在頂端固定區域下方（同一個縮放座標）
  const band = await rect(page, '.top-band');
  expect((await rect(page, '.thumbnails')).y).toBeCloseTo(band.y + band.h + 8 / 2, 0);

  await page.getByRole('button', { name: '匯出 PDF', exact: true }).click();
  const dialog = page.locator('.dialog');
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((d) => getComputedStyle(d.closest('.hud')!).transform)).toBe(
    'matrix(0.5, 0, 0, 0.5, 50, 80)',
  );
});

test('回到書架：頂端列不受縮放影響', async ({ page }) => {
  await zoom(page, 2, 100, 200);
  await page.getByRole('button', { name: '‹ 書架' }).click();
  await expect(page.getByRole('button', { name: '新增筆記本' })).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-chrome');
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.querySelector('.app-hud')!).transform))
    .toBe('none');
});

/** 只改 visualViewport 的數值、不送事件（模擬快速縮放時 Safari 漏送事件） */
const silentZoom = (page: Page, scale: number, x: number, y: number) =>
  page.evaluate(
    ({ scale, x, y }) => {
      const vv = window.visualViewport!;
      Object.defineProperty(vv, 'scale', { configurable: true, get: () => scale });
      Object.defineProperty(vv, 'offsetLeft', { configurable: true, get: () => x });
      Object.defineProperty(vv, 'offsetTop', { configurable: true, get: () => y });
    },
    { scale, x, y },
  );
const hudTransform = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.querySelector('.app-hud')!).transform);
const touch = (page: Page, type: 'touchstart' | 'touchend') =>
  page.evaluate((type) => window.dispatchEvent(new TouchEvent(type, { bubbles: true })), type);

test('縮放事件漏送：手指在螢幕上時仍會逐 frame 同步，放開 0.5 秒後停止', async ({ page }) => {
  await touch(page, 'touchstart');
  await silentZoom(page, 2, 30, 40);
  await expect.poll(() => hudTransform(page)).toBe('matrix(0.5, 0, 0, 0.5, 30, 40)');

  // 放開後 0.5 秒內最後的變化也會同步
  await touch(page, 'touchend');
  await silentZoom(page, 1.5, 10, 20);
  await expect.poll(() => hudTransform(page), { timeout: 400 }).toMatch(/^matrix\(0\.666/);

  // 停止後不再輪詢（沒有手指、沒有事件就不會變）
  await page.waitForTimeout(700);
  await silentZoom(page, 3, 0, 0);
  await page.waitForTimeout(200);
  expect(await hudTransform(page)).toMatch(/^matrix\(0\.666/);
});
