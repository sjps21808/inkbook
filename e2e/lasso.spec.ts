import { expect, test, type Page } from '@playwright/test';
import { drawStroke, elementCount, hLine, inkPixel, openNewNotebook, type Pt } from './helpers/pen';

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

/** 圈住 y0~y1 之間的矩形（套索軌跡） */
const lassoRect = (y0: number, y1: number): Pt[] => [
  [0.1, y0],
  [0.5, y0],
  [0.9, y0],
  [0.9, y1],
  [0.5, y1],
  [0.1, y1],
  [0.1, y0],
];

/** 縮放把手中心在頁面上的相對位置 */
const handlePos = (page: Page) =>
  page.evaluate(() => {
    const r = document.querySelector('.page[data-index="0"]')!.getBoundingClientRect();
    const h = document.querySelector('.selection .handle')!.getBoundingClientRect();
    return [(h.left + h.width / 2 - r.left) / r.width, (h.top + h.height / 2 - r.top) / r.height] as Pt;
  });

test.beforeEach(async ({ page }) => {
  await openNewNotebook(page);
  await drawStroke(page, hLine(0.3));
  await drawStroke(page, hLine(0.6));
  await expect.poll(() => elementCount(page)).toBe(2);
  await button(page, '套索').click();
  await drawStroke(page, lassoRect(0.25, 0.35));
  await expect(page.locator('.selection')).toBeVisible();
});

test('圈選後刪除，undo 還原', async ({ page }) => {
  await button(page, '刪除選取').click();
  await expect.poll(() => elementCount(page)).toBe(1);
  await expect.poll(async () => (await inkPixel(page, [0.5, 0.3]))[3]).toBe(0);
  expect((await inkPixel(page, [0.5, 0.6]))[3]).toBe(255);
  await expect(page.locator('.selection')).toHaveCount(0);
  await button(page, '復原').click();
  await expect.poll(() => elementCount(page)).toBe(2);
  await expect.poll(async () => (await inkPixel(page, [0.5, 0.3]))[3]).toBe(255);
});

test('只選中超過一半在範圍內的筆畫', async ({ page }) => {
  // 只圈住第一條線的左半邊（不到一半的點）→ 沒選到
  await drawStroke(page, [
    [0.1, 0.25],
    [0.45, 0.25],
    [0.45, 0.35],
    [0.1, 0.35],
  ]);
  await expect(page.locator('.selection')).toHaveCount(0);
});

test('在選取框內拖曳 = 移動', async ({ page }) => {
  await drawStroke(page, [
    [0.5, 0.3],
    [0.5, 0.4],
    [0.5, 0.45],
  ]);
  await expect.poll(async () => (await inkPixel(page, [0.5, 0.45]))[3]).toBe(255);
  expect((await inkPixel(page, [0.5, 0.3]))[3]).toBe(0);
  expect(await elementCount(page)).toBe(2);
  await button(page, '復原').click();
  await expect.poll(async () => (await inkPixel(page, [0.5, 0.3]))[3]).toBe(255);
  expect((await inkPixel(page, [0.5, 0.45]))[3]).toBe(0);
});

test('拖右下角把手 = 等比放大', async ({ page }) => {
  expect((await inkPixel(page, [0.88, 0.3]))[3]).toBe(0);
  const [hx, hy] = await handlePos(page);
  await drawStroke(page, [
    [hx, hy],
    [hx + 0.06, hy],
    [hx + 0.12, hy],
  ]);
  await expect.poll(async () => (await inkPixel(page, [0.88, 0.3]))[3]).toBe(255);
  // 另一條線沒有被影響
  expect((await inkPixel(page, [0.88, 0.6]))[3]).toBe(0);
});

test('選取時點顏色 = 改色', async ({ page }) => {
  await button(page, '紅').click();
  await expect.poll(async () => (await inkPixel(page, [0.5, 0.3]))[0]).toBeGreaterThan(200);
  const other = await inkPixel(page, [0.5, 0.6]);
  expect(Math.max(other[0], other[1], other[2])).toBeLessThan(60);
  await button(page, '復原').click();
  await expect.poll(async () => (await inkPixel(page, [0.5, 0.3]))[0]).toBeLessThan(60);
});

test('複製選取：多一筆，且選取移到複本', async ({ page }) => {
  await button(page, '複製選取').click();
  await expect.poll(() => elementCount(page)).toBe(3);
  await button(page, '刪除選取').click();
  await expect.poll(() => elementCount(page)).toBe(2);
  // 刪掉的是複本，原本那一筆還在
  expect((await inkPixel(page, [0.5, 0.3]))[3]).toBe(255);
});
