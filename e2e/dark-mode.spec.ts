import { expect, test, type Page } from '@playwright/test';
import { bgPixel, openNewNotebook, waitReady } from './helpers/pen';

// 專案沒有 @types/node
declare const Buffer: { from(d: Uint8Array): { toString(enc: 'base64'): string } };

/**
 * 截圖上實際畫出的顏色（每個像素 [r, g, b]）。
 * 不用 getComputedStyle：Playwright WebKit 偶爾回報過時的值（畫面其實正確），測試會不穩定
 */
async function painted(page: Page, clip: { x: number; y: number; width: number; height: number }) {
  const b64 = Buffer.from(await page.screenshot({ clip })).toString('base64');
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const img = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const px: [number, number, number][] = [];
    for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
    return px;
  }, b64);
}

/**
 * 元素的背景色：取元素上緣往下 3px、水平置中的像素（避開文字與圓角）；body 取視窗左下角。
 * edge = 'bottom' 改取下緣往上 3px（頁面上緣會被選單蓋住；大選單上緣有快捷列的陰影）
 */
async function bgColor(page: Page, selector: string, edge: 'top' | 'bottom' = 'top'): Promise<string> {
  let x: number, y: number;
  if (selector === 'body') {
    const vp = page.viewportSize()!;
    [x, y] = [2, vp.height - 2];
  } else {
    const box = (await page.locator(selector).first().boundingBox())!;
    const y0 = edge === 'top' ? box.y + 3 : box.y + box.height - 3;
    [x, y] = [Math.floor(box.x + box.width / 2), Math.floor(y0)];
  }
  const [[r, g, b]] = await painted(page, { x, y, width: 1, height: 1 });
  return `rgb(${r}, ${g}, ${b})`;
}

/** 元素範圍內最亮的像素亮度（深色背景上的淺色文字會是最亮的） */
async function brightest(page: Page, selector: string): Promise<number> {
  const box = (await page.locator(selector).first().boundingBox())!;
  const px = await painted(page, box);
  return Math.max(...px.map(([r, g, b]) => Math.min(r, g, b)));
}

const WHITE = 'rgb(255, 255, 255)';

test.describe('深色模式', () => {
  test.use({ colorScheme: 'dark' });

  test('UI 變成深色，頁面、縮圖維持白紙', async ({ page }) => {
    await openNewNotebook(page);
    expect(await bgColor(page, 'body')).toBe('rgb(0, 0, 0)');
    expect(await bgColor(page, '.toolbar', 'bottom')).toBe('rgb(22, 22, 24)');
    expect(await bgColor(page, '.toolbar button')).toBe('rgb(28, 28, 30)');
    // 按鈕文字是淺色（#f2f2f7）
    expect(await brightest(page, '.toolbar button')).toBeGreaterThan(200);

    expect(await bgColor(page, '.page', 'bottom')).toBe(WHITE);
    expect(await bgPixel(page, [300, 400])).toEqual([255, 255, 255, 255]);

    await page.getByRole('button', { name: '頁面', exact: true }).click();
    await page.locator('.thumb-img img').first().waitFor();
    expect(await bgColor(page, '.thumb-img')).toBe(WHITE);
  });

  test('書架、選單與對話框也是深色', async ({ page }) => {
    await openNewNotebook(page, '數學');
    await page.getByRole('button', { name: '‹ 書架' }).click();
    expect(await bgColor(page, '.topbar')).toBe('rgb(28, 28, 30)');
    expect(await bgColor(page, '.notebook-card')).toBe('rgb(28, 28, 30)');
    await page.getByRole('button', { name: '數學 選項' }).click();
    expect(await bgColor(page, '.item-menu .menu')).toBe('rgb(28, 28, 30)');
    await page.getByRole('menuitem', { name: '重新命名' }).click();
    expect(await bgColor(page, '.dialog')).toBe('rgb(28, 28, 30)');
  });
});

test('淺色模式維持原本的配色', async ({ page }) => {
  await openNewNotebook(page);
  expect(await bgColor(page, 'body')).toBe('rgb(242, 242, 245)');
  expect(await bgColor(page, '.toolbar', 'bottom')).toBe('rgb(249, 249, 251)');
  expect(await bgColor(page, '.page', 'bottom')).toBe(WHITE);
});

const theme = (page: Page) => page.getByRole('combobox', { name: '外觀' });

test.describe('外觀選單', () => {
  test('只有淺色、深色；第一次開啟依系統（深色），選「淺色」→ UI 變淺色，系統再變也不跟著變', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openNewNotebook(page);
    await expect(theme(page).locator('option')).toHaveText(['淺色', '深色']);
    await expect(theme(page)).toHaveValue('dark');
    await theme(page).selectOption({ label: '淺色' });
    expect(await bgColor(page, 'body')).toBe('rgb(242, 242, 245)');
    expect(await bgColor(page, '.toolbar', 'bottom')).toBe('rgb(249, 249, 251)');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.emulateMedia({ colorScheme: 'dark' });
    expect(await bgColor(page, 'body')).toBe('rgb(242, 242, 245)');
  });

  test('系統淺色時選「深色」→ UI 變深色、頁面仍是白紙；重新整理後設定還在', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await openNewNotebook(page);
    await theme(page).selectOption({ label: '深色' });
    expect(await bgColor(page, 'body')).toBe('rgb(0, 0, 0)');
    expect(await bgColor(page, '.toolbar', 'bottom')).toBe('rgb(22, 22, 24)');
    expect(await bgColor(page, '.page', 'bottom')).toBe(WHITE);

    await page.reload();
    await waitReady(page);
    await expect(theme(page)).toHaveValue('dark');
    expect(await bgColor(page, 'body')).toBe('rgb(0, 0, 0)');
    expect(await bgPixel(page, [300, 400])).toEqual([255, 255, 255, 255]);

    await page.getByRole('button', { name: '‹ 書架' }).click();
    await expect(theme(page)).toHaveValue('dark');
    expect(await bgColor(page, '.topbar')).toBe('rgb(28, 28, 30)');
  });
});
