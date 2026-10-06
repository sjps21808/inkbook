import { expect, test, type Page } from '@playwright/test';
import { drawStroke, elementCount, hLine, inkPixel, openNewNotebook, pickColor, waitReady } from './helpers/pen';

const tool = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

test.beforeEach(async ({ page }) => {
  await openNewNotebook(page);
});

test('選紅色後畫出紅色', async ({ page }) => {
  await pickColor(page, '紅');
  // 色盤關閉，圓圈顯示目前顏色
  await expect(page.getByRole('group', { name: '選擇顏色' })).toHaveCount(0);
  await expect(tool(page, '顏色：紅')).toBeVisible();
  await drawStroke(page, hLine(0.3));
  const [r, g, b, a] = await inkPixel(page, [0.5, 0.3]);
  expect(a).toBe(255);
  expect(r).toBeGreaterThan(200);
  expect(g).toBeLessThan(90);
  expect(b).toBeLessThan(90);
});

test('粗細：粗線蓋得到中心外 2pt，細線蓋不到', async ({ page }) => {
  const off = 2 / 842;
  await tool(page, '細').click();
  await drawStroke(page, hLine(0.3));
  await tool(page, '粗').click();
  await drawStroke(page, hLine(0.5));
  expect((await inkPixel(page, [0.5, 0.3]))[3]).toBe(255);
  expect((await inkPixel(page, [0.5, 0.3 + off]))[3]).toBe(0);
  expect((await inkPixel(page, [0.5, 0.5 + off]))[3]).toBe(255);
});

test('螢光筆在筆跡下方：筆跡仍是深色，單獨的螢光筆半透明', async ({ page }) => {
  await drawStroke(page, hLine(0.3));
  await tool(page, '螢光筆').click();
  await pickColor(page, '黃');
  await tool(page, '粗').click();
  // 直線穿過筆跡（x = 0.5）
  await drawStroke(page, [
    [0.5, 0.25],
    [0.5, 0.3],
    [0.5, 0.35],
  ]);
  await expect.poll(() => elementCount(page)).toBe(2);
  const cross = await inkPixel(page, [0.5, 0.3]);
  expect(Math.max(cross[0], cross[1], cross[2])).toBeLessThan(60);
  expect(cross[3]).toBe(255);
  const hl = await inkPixel(page, [0.5, 0.33]);
  expect(hl[3]).toBeGreaterThan(100);
  expect(hl[3]).toBeLessThan(160);
  expect(hl[0]).toBeGreaterThan(200); // 黃
  expect(hl[2]).toBeLessThan(120);
});

test('復原／重做，且結果寫入資料庫', async ({ page }) => {
  const undo = tool(page, '復原');
  const redo = tool(page, '重做');
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();

  await drawStroke(page, hLine(0.3));
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect.poll(async () => (await inkPixel(page, [0.5, 0.3]))[3]).toBe(0);
  await expect.poll(() => elementCount(page)).toBe(0);
  await expect(undo).toBeDisabled();
  await expect(redo).toBeEnabled();

  await redo.click();
  await expect.poll(async () => (await inkPixel(page, [0.5, 0.3]))[3]).toBe(255);
  await expect.poll(() => elementCount(page)).toBe(1);

  await undo.click();
  await expect.poll(() => elementCount(page)).toBe(0);
  await page.reload();
  await waitReady(page);
  await page.waitForTimeout(300);
  expect((await inkPixel(page, [0.5, 0.3]))[3]).toBe(0);
});

test('畫完立刻復原，筆畫不會復活', async ({ page }) => {
  await drawStroke(page, hLine(0.3));
  await tool(page, '復原').click();
  await expect.poll(() => elementCount(page)).toBe(0);
  await page.waitForTimeout(300);
  expect(await elementCount(page)).toBe(0);
});

test('multiply 混合只在有螢光筆或正在用螢光筆時開啟', async ({ page }) => {
  const blend = () =>
    page.locator('.page[data-index="0"] canvas.ink').evaluate((el) => getComputedStyle(el).mixBlendMode);
  await drawStroke(page, hLine(0.3));
  expect(await blend()).toBe('normal');
  await tool(page, '螢光筆').click();
  expect(await blend()).toBe('multiply');
  await drawStroke(page, hLine(0.5));
  await expect.poll(() => elementCount(page)).toBe(2);
  await tool(page, '筆').click();
  expect(await blend()).toBe('multiply'); // 頁面上有螢光筆
  await tool(page, '復原').click();
  await expect.poll(blend).toBe('normal');
});

test('色盤：16 色排成 4×4，點外面會關閉', async ({ page }) => {
  const circle = page.getByRole('button', { name: /^顏色：/ });
  await expect(circle).toHaveAccessibleName('顏色：黑');
  await circle.click();
  const grid = page.getByRole('group', { name: '選擇顏色' });
  const swatches = grid.getByRole('button');
  await expect(swatches).toHaveCount(16);
  // 4 欄：第 1、5 個在同一欄，第 1～4 個在同一列
  const box = async (i: number) => (await swatches.nth(i).boundingBox())!;
  expect((await box(4)).x).toBeCloseTo((await box(0)).x, 0);
  expect((await box(3)).y).toBeCloseTo((await box(0)).y, 0);
  expect((await box(4)).y).toBeGreaterThan((await box(0)).y);
  await expect(grid.getByRole('button', { name: '黑', exact: true })).toHaveAttribute('aria-pressed', 'true');

  // 點頁面（色盤外）→ 關閉，顏色不變
  await page.mouse.click(400, 900);
  await expect(grid).toHaveCount(0);
  await expect(circle).toHaveAccessibleName('顏色：黑');
});

test('新增的顏色（深藍）可以畫出來', async ({ page }) => {
  await pickColor(page, '深藍');
  await drawStroke(page, hLine(0.3));
  const [r, g, b, a] = await inkPixel(page, [0.5, 0.3]);
  expect(a).toBe(255);
  expect([r, g, b]).toEqual([0x39, 0x49, 0xab]);
});
