import { expect, test, type Page } from '@playwright/test';
import { drawStroke, elementCount, hLine, inkPixel, openNewNotebook, type Pt } from './helpers/pen';

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

/** 垂直穿過 x 的一條線（橡皮擦軌跡） */
const vLine = (x: number, y0: number, y1: number): Pt[] =>
  Array.from({ length: 7 }, (_, i) => [x, y0 + ((y1 - y0) * i) / 6]);

test.beforeEach(async ({ page }) => {
  await openNewNotebook(page);
  await drawStroke(page, hLine(0.3));
  await expect.poll(() => elementCount(page)).toBe(1);
  await button(page, '橡皮擦').click();
});

test('預設為局部擦除：從中間擦斷成兩段，undo 還原成一筆', async ({ page }) => {
  // 選中的橡皮擦再點一次：跳出模式選單，預設局部
  await button(page, '橡皮擦').click();
  await expect(button(page, '局部')).toHaveAttribute('aria-pressed', 'true');
  await button(page, '局部').click();
  await expect(button(page, '局部')).toHaveCount(0);
  await drawStroke(page, vLine(0.5, 0.25, 0.35));
  await expect.poll(() => elementCount(page)).toBe(2);
  expect((await inkPixel(page, [0.5, 0.3]))[3]).toBe(0);
  expect((await inkPixel(page, [0.3, 0.3]))[3]).toBe(255);
  expect((await inkPixel(page, [0.7, 0.3]))[3]).toBe(255);

  await button(page, '復原').click();
  await expect.poll(() => elementCount(page)).toBe(1);
  await expect.poll(async () => (await inkPixel(page, [0.5, 0.3]))[3]).toBe(255);

  await button(page, '重做').click();
  await expect.poll(() => elementCount(page)).toBe(2);
  await expect.poll(async () => (await inkPixel(page, [0.5, 0.3]))[3]).toBe(0);
});

test('一次拖曳擦兩個地方只算一步 undo', async ({ page }) => {
  await drawStroke(page, [...vLine(0.4, 0.25, 0.35), ...vLine(0.6, 0.35, 0.25)]);
  await expect.poll(() => elementCount(page)).toBe(3);
  await button(page, '復原').click();
  await expect.poll(() => elementCount(page)).toBe(1);
  await expect(button(page, '復原')).toBeEnabled(); // 還剩畫線那一步
});

test('整筆擦除：碰到就整筆刪掉', async ({ page }) => {
  await button(page, '筆').click();
  await drawStroke(page, hLine(0.6));
  await expect.poll(() => elementCount(page)).toBe(2);
  await button(page, '橡皮擦').click();
  await button(page, '橡皮擦').click(); // 再點一次：模式選單
  await button(page, '整筆').click();
  await drawStroke(page, vLine(0.5, 0.25, 0.35));
  await expect.poll(() => elementCount(page)).toBe(1);
  expect((await inkPixel(page, [0.3, 0.3]))[3]).toBe(0);
  expect((await inkPixel(page, [0.5, 0.6]))[3]).toBe(255);
  await button(page, '復原').click();
  await expect.poll(() => elementCount(page)).toBe(2);
});

test('沒碰到筆畫時不產生動作', async ({ page }) => {
  await button(page, '復原').click(); // 只剩畫線那一步 → 復原後沒有可復原的
  await button(page, '重做').click();
  await expect.poll(() => elementCount(page)).toBe(1);
  await drawStroke(page, vLine(0.5, 0.6, 0.7));
  await button(page, '復原').click();
  await expect.poll(() => elementCount(page)).toBe(0); // 復原的是畫線，而不是擦除
});

test('橡皮擦模式選單：只有選中的橡皮擦再點才出現，點外面關閉，大選單裡沒有模式按鈕', async ({ page }) => {
  // beforeEach 已選了橡皮擦；換成筆再選橡皮擦 → 只是切換工具，不跳選單
  await button(page, '筆').click();
  await button(page, '橡皮擦').click();
  await expect(page.getByRole('group', { name: '橡皮擦模式' })).toHaveCount(0);
  await button(page, '橡皮擦').click();
  await expect(page.getByRole('group', { name: '橡皮擦模式' })).toBeVisible();
  await page.mouse.click(400, 900);
  await expect(page.getByRole('group', { name: '橡皮擦模式' })).toHaveCount(0);
  await expect(page.getByRole('toolbar', { name: '工具列' }).getByRole('button', { name: '局部' })).toHaveCount(0);
});
