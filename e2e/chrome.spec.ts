import { expect, test, type Page } from '@playwright/test';
import { drawStroke, elementCount, hLine, openNewNotebook, waitReady } from './helpers/pen';

const toggle = (page: Page, name: '收起選單' | '展開選單') => page.getByRole('button', { name, exact: true });
const menu = (page: Page) => page.getByRole('toolbar', { name: '工具列' });
const quick = (page: Page) => page.getByRole('toolbar', { name: '快捷工具' });

/** 第 1 頁整頁在螢幕內 */
const pageInView = (page: Page) =>
  page.evaluate(() => {
    const r = document.querySelector('.page[data-index="0"]')!.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= document.documentElement.clientHeight;
  });
const bottomOf = (page: Page, selector: string) =>
  page.evaluate((s) => document.querySelector(s)!.getBoundingClientRect().bottom, selector);
const topOf = (page: Page, selector: string) =>
  page.evaluate((s) => document.querySelector(s)!.getBoundingClientRect().top, selector);

test.beforeEach(async ({ page }) => {
  await openNewNotebook(page, '測試筆記', false);
});

test('預設收起：只有浮動列；展開後大選單出現，重新整理後維持；收起後也維持', async ({ page }) => {
  await expect(quick(page)).toBeVisible();
  await expect(menu(page)).toBeHidden();
  await expect(page.locator('.topbar')).toBeHidden();
  expect(await pageInView(page)).toBe(true);

  await toggle(page, '展開選單').click();
  await expect(menu(page)).toBeVisible();
  await expect(page.locator('.topbar')).toBeVisible();
  await page.reload();
  await waitReady(page);
  await expect(menu(page)).toBeVisible();

  await toggle(page, '收起選單').click();
  await expect(menu(page)).toBeHidden();
  await page.reload();
  await waitReady(page);
  await expect(menu(page)).toBeHidden();
  await expect(quick(page)).toBeVisible();
});

test('大選單開關：收起時是 ▼，展開時是 ▲', async ({ page }) => {
  const dir = () => page.locator('.menu-toggle path').getAttribute('data-dir');
  expect(await dir()).toBe('down');
  await toggle(page, '展開選單').click();
  await expect.poll(dir).toBe('up');
  await toggle(page, '收起選單').click();
  await expect.poll(dir).toBe('down');
});

test('快捷列在頂端固定區域裡，白紙從它下面開始；大選單從它下方展開', async ({ page }) => {
  const band = await bottomOf(page, '.top-band');
  const barTop = await topOf(page, '.quickbar');
  expect(await bottomOf(page, '.quickbar')).toBeLessThanOrEqual(band); // 快捷列在固定區域裡
  // 白紙不被頂端固定區域蓋住
  expect(await topOf(page, '.page[data-index="0"]')).toBeGreaterThanOrEqual(band);
  expect(await pageInView(page)).toBe(true);

  await toggle(page, '展開選單').click();
  await expect(menu(page)).toBeVisible();
  // 快捷列不動；頂端列＋工具列接在固定區域下方
  expect(await topOf(page, '.quickbar')).toBe(barTop);
  await expect.poll(() => topOf(page, '.topbar')).toBeCloseTo(band, 0);
  await expect.poll(() => topOf(page, '.toolbar')).toBeCloseTo(await bottomOf(page, '.topbar'), 0);

  // 大選單展開狀態下重新整理：位置一樣，快捷列點得到
  await page.reload();
  await waitReady(page);
  await expect(menu(page)).toBeVisible();
  await expect.poll(() => topOf(page, '.topbar')).toBeCloseTo(band, 0);
  await quick(page).getByRole('button', { name: '粗' }).click();
  await expect(quick(page).getByRole('button', { name: '粗' })).toHaveAttribute('aria-pressed', 'true');
});

test('展開或收起大選單不改變頁面大小與位置', async ({ page }) => {
  const box = () =>
    page.evaluate(() => {
      const r = document.querySelector('.page-slot')!.getBoundingClientRect();
      return { top: r.top, left: r.left, w: r.width };
    });
  const before = await box();
  await toggle(page, '展開選單').click();
  expect(await box()).toEqual(before);
  await toggle(page, '收起選單').click();
  expect(await box()).toEqual(before);
});

test('從大選單回到書架：書架一出現，編輯頁的版面就已經拿掉（不會閃一下）', async ({ page }) => {
  await toggle(page, '展開選單').click();
  await page.getByRole('button', { name: '‹ 書架' }).click();
  await page.getByRole('button', { name: '新增筆記本' }).waitFor();
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-chrome'))).toBe(false);
});

test('大選單收起時回到書架，頂端列正常顯示', async ({ page }) => {
  await page.goBack();
  await expect(page.getByRole('button', { name: '新增筆記本' })).toBeVisible();
  await expect(page.locator('.topbar')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-chrome');
});

test('浮動列切換工具與粗細；大選單裡沒有重複的工具', async ({ page }) => {
  const q = quick(page);
  await expect(q.getByRole('button', { name: '筆', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await q.getByRole('button', { name: '螢光筆' }).click();
  await expect(q.getByRole('button', { name: '螢光筆' })).toHaveAttribute('aria-pressed', 'true');
  await expect(q.getByRole('button', { name: '筆', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await q.getByRole('button', { name: '粗' }).click();
  await expect(q.getByRole('button', { name: '粗' })).toHaveAttribute('aria-pressed', 'true');
  await expect(q.getByRole('button', { name: '中' })).toHaveAttribute('aria-pressed', 'false');

  await toggle(page, '展開選單').click();
  for (const name of ['筆', '螢光筆', '橡皮擦', '套索', '細', '中', '粗', '復原', '重做'])
    await expect(menu(page).getByRole('button', { name, exact: true })).toHaveCount(0);
  for (const name of ['‹ 書架', '圖片', '文字', '頁面', '匯出 PDF', '新增頁面', '刪除頁面'])
    await expect(menu(page).getByRole('button', { name, exact: true })).toBeVisible();
});

test('套索選取時浮動列出現複製、刪除選取', async ({ page }) => {
  await drawStroke(page, hLine(0.3));
  await expect.poll(() => elementCount(page)).toBe(1);
  const q = quick(page);
  await q.getByRole('button', { name: '套索', exact: true }).click();
  await expect(q.getByRole('button', { name: '刪除選取' })).toHaveCount(0);

  await drawStroke(page, [
    [0.1, 0.25],
    [0.9, 0.25],
    [0.9, 0.35],
    [0.1, 0.35],
    [0.1, 0.25],
  ]);
  await q.getByRole('button', { name: '複製選取' }).click();
  await expect.poll(() => elementCount(page)).toBe(2);
  await q.getByRole('button', { name: '刪除選取' }).click();
  await expect.poll(() => elementCount(page)).toBe(1);
  await expect(q.getByRole('button', { name: '刪除選取' })).toHaveCount(0);
});

test('大選單收起時有新版本：☰ 顯示紅點，展開後消失', async ({ page }) => {
  const dot = () =>
    page.evaluate(() => getComputedStyle(document.querySelector('.menu-toggle')!, '::after').content);
  expect(await dot()).toBe('none');
  // 模擬 UpdatePrompt 偵測到新版（測試時擋掉 SW）
  await page.evaluate(() => {
    const b = document.createElement('button');
    b.className = 'update-btn';
    document.querySelector('.topbar')!.append(b);
  });
  await expect.poll(dot).not.toBe('none');
  await toggle(page, '展開選單').click();
  await expect.poll(dot).toBe('none');
});
