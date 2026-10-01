import { expect, test, type Page } from '@playwright/test';
import { drawStroke, elementCount, hLine, inkPixel } from './helpers/pen';

const tool = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.page canvas.ink')).toBeVisible();
});

test('選紅色後畫出紅色', async ({ page }) => {
  await tool(page, '紅').click();
  await expect(tool(page, '紅')).toHaveAttribute('aria-pressed', 'true');
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
  await tool(page, '黃').click();
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
  await expect(page.locator('.page canvas.ink')).toBeVisible();
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
