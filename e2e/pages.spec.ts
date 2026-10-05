import { expect, test, type Page } from '@playwright/test';
import {
  bgPixel,
  drawStroke,
  elementCount,
  hLine,
  inkPixel,
  mountedPages,
  openNewNotebook,
  goToPage,
  pageCount,
  waitReady,
} from './helpers/pen';

const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

const addPage = async (page: Page, template: string) => {
  await btn(page, '新增頁面').click();
  await page.getByRole('menuitem', { name: template }).click();
};

test.beforeEach(async ({ page }) => {
  await openNewNotebook(page);
});

test('四種模板：新增頁面時選擇，bg 圖層畫出對應的線條', async ({ page }) => {
  // 第 1 頁空白：橫線位置是白的
  expect((await bgPixel(page, [300, 72]))[0]).toBe(255);
  await addPage(page, '橫線');
  await waitReady(page, 1);
  await expect.poll(async () => (await bgPixel(page, [300, 72], 1))[0]).toBeLessThan(250);
  expect((await bgPixel(page, [300, 84], 1))[0]).toBe(255); // 兩條線之間

  await addPage(page, '方格');
  await waitReady(page, 2);
  const mm5 = (5 * 72) / 25.4;
  await expect.poll(async () => (await bgPixel(page, [mm5, 400], 2))[0]).toBeLessThan(250);

  await addPage(page, '點陣');
  await waitReady(page, 3);
  await expect.poll(async () => (await bgPixel(page, [mm5, mm5], 3))[0]).toBeLessThan(250);
  expect((await bgPixel(page, [mm5 * 1.5, mm5 * 1.5], 3))[0]).toBe(255);
  expect(await pageCount(page)).toBe(4);
});

test('新增頁面插在目前頁後面，undo/redo 會移除／加回', async ({ page }) => {
  await addPage(page, '空白');
  await expect.poll(() => pageCount(page)).toBe(2);
  await btn(page, '復原').click();
  await expect.poll(() => pageCount(page)).toBe(1);
  await expect.poll(() => mountedPages(page)).toEqual([0]);
  await btn(page, '重做').click();
  await expect.poll(() => pageCount(page)).toBe(2);
  await expect.poll(() => mountedPages(page)).toEqual([0, 1]);
});

test('只剩一頁時不能刪除', async ({ page }) => {
  await expect(btn(page, '刪除頁面')).toBeDisabled();
});

test('刪除頁面要確認；undo 會還原頁面與筆畫並翻回該頁；重新整理後一致', async ({ page }) => {
  await addPage(page, '空白');
  await addPage(page, '空白');
  await expect.poll(() => pageCount(page)).toBe(3);
  // 等 App 新增頁面後自己翻到新頁完成，再翻到第 2 頁（否則 App 的翻頁會蓋掉）
  await waitReady(page, 2);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await goToPage(page, 1);
  await drawStroke(page, hLine(0.3), 'pen', 1);
  await expect.poll(() => elementCount(page)).toBe(1);

  // 取消不會刪除
  await btn(page, '刪除頁面').click();
  await expect(page.getByText('刪除第 2 頁？')).toBeVisible();
  await btn(page, '取消').click();
  expect(await pageCount(page)).toBe(3);

  await btn(page, '刪除頁面').click();
  await btn(page, '刪除').click();
  await expect.poll(() => pageCount(page)).toBe(2);
  await expect.poll(() => elementCount(page)).toBe(0);

  await goToPage(page, 0);
  await btn(page, '復原').click();
  await expect.poll(() => pageCount(page)).toBe(3);
  await expect.poll(() => elementCount(page)).toBe(1);
  await waitReady(page, 1);
  await expect.poll(async () => (await inkPixel(page, [0.5, 0.3], 1))[3]).toBe(255);

  await page.reload();
  await waitReady(page);
  await goToPage(page, 1);
  await expect.poll(async () => (await inkPixel(page, [0.5, 0.3], 1))[3]).toBe(255);
});
