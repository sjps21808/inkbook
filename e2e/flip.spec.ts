import { expect, test, type Page } from '@playwright/test';
import { currentPage, openNewNotebook, seedPages, swipe, waitReady } from './helpers/pen';

/** 在目前頁上發出一串 pointer 事件 */
const fire = (page: Page, events: { type: string; pointerType: string; id: number; fx: number; fy: number }[]) =>
  page.evaluate((events) => {
    const cur = document.querySelector<HTMLElement>('.pages')!.dataset.current;
    const target = document.querySelector(`.page[data-index="${cur}"] .overlay`)!;
    const r = target.getBoundingClientRect();
    for (const e of events)
      target.dispatchEvent(
        new PointerEvent(e.type, {
          pointerType: e.pointerType,
          pointerId: e.id,
          clientX: r.left + e.fx * r.width,
          clientY: r.top + e.fy * r.height,
          pressure: 0.5,
          bubbles: true,
          cancelable: true,
        }),
      );
  }, events);

test.beforeEach(async ({ page }) => {
  await openNewNotebook(page);
  await seedPages(page, 3);
});

test('一次顯示一頁，頁面不能上下捲動', async ({ page }) => {
  expect(await currentPage(page)).toBe(0);
  const fits = await page.evaluate(
    () => document.documentElement.scrollHeight <= document.documentElement.clientHeight,
  );
  expect(fits).toBe(true);
  // 相鄰頁在畫面外
  const nextVisible = await page.evaluate(() => {
    const r = document.querySelector('.page[data-index="1"]')!.getBoundingClientRect();
    return r.left < document.documentElement.clientWidth;
  });
  expect(nextVisible).toBe(false);
});

test('手指往左滑下一頁、往右滑上一頁，動畫結束後新頁完整在畫面內', async ({ page }) => {
  await swipe(page, 1);
  expect(await currentPage(page)).toBe(1);
  await waitReady(page, 1);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const r = document.querySelector('.page[data-index="1"]')!.getBoundingClientRect();
        return r.left >= 0 && r.right <= document.documentElement.clientWidth;
      }),
    )
    .toBe(true);
  await swipe(page, -1);
  expect(await currentPage(page)).toBe(0);
});

test('第一頁往前、最後一頁往後翻：停在原頁，頁數不變', async ({ page }) => {
  await swipe(page, -1);
  expect(await currentPage(page)).toBe(0);
  await swipe(page, 1);
  await swipe(page, 1);
  expect(await currentPage(page)).toBe(2);
  await swipe(page, 1);
  expect(await currentPage(page)).toBe(2);
  await expect(page.locator('.page')).toHaveCount(2); // 第 2、3 頁
});

test('Pencil 書寫中手掌滑過不翻頁', async ({ page }) => {
  await fire(page, [
    { type: 'pointerdown', pointerType: 'pen', id: 7, fx: 0.5, fy: 0.3 },
    { type: 'pointerdown', pointerType: 'touch', id: 11, fx: 0.8, fy: 0.7 },
    { type: 'pointermove', pointerType: 'pen', id: 7, fx: 0.6, fy: 0.3 },
    { type: 'pointerup', pointerType: 'touch', id: 11, fx: 0.2, fy: 0.7 },
    { type: 'pointerup', pointerType: 'pen', id: 7, fx: 0.6, fy: 0.3 },
  ]);
  expect(await currentPage(page)).toBe(0);
});

test('雙指與上下滑動不翻頁', async ({ page }) => {
  await fire(page, [
    { type: 'pointerdown', pointerType: 'touch', id: 11, fx: 0.8, fy: 0.4 },
    { type: 'pointerdown', pointerType: 'touch', id: 12, fx: 0.8, fy: 0.6 },
    { type: 'pointerup', pointerType: 'touch', id: 11, fx: 0.2, fy: 0.4 },
    { type: 'pointerup', pointerType: 'touch', id: 12, fx: 0.2, fy: 0.6 },
  ]);
  expect(await currentPage(page)).toBe(0);
  await fire(page, [
    { type: 'pointerdown', pointerType: 'touch', id: 11, fx: 0.5, fy: 0.8 },
    { type: 'pointerup', pointerType: 'touch', id: 11, fx: 0.45, fy: 0.2 },
  ]);
  expect(await currentPage(page)).toBe(0);
});

test('工具列翻頁按鈕與頁碼', async ({ page }) => {
  const prev = page.getByRole('button', { name: '上一頁' });
  const next = page.getByRole('button', { name: '下一頁' });
  const no = page.locator('.page-no');
  await expect(no).toHaveText('1 / 3');
  await expect(prev).toBeDisabled();
  await next.click();
  await expect(no).toHaveText('2 / 3');
  expect(await currentPage(page)).toBe(1);
  await next.click();
  await expect(no).toHaveText('3 / 3');
  await expect(next).toBeDisabled();
  await prev.click();
  await expect(no).toHaveText('2 / 3');
  // 滑動翻頁也會更新頁碼
  await swipe(page, -1);
  await expect(no).toHaveText('1 / 3');
});

test('選單收起時翻頁按鈕隱藏，仍可滑動翻頁', async ({ page }) => {
  await page.getByRole('button', { name: '收起選單' }).click();
  await expect(page.getByRole('button', { name: '下一頁' })).toBeHidden();
  await swipe(page, 1);
  expect(await currentPage(page)).toBe(1);
});

test('重新開啟筆記本時翻到上次看的頁面', async ({ page }) => {
  await swipe(page, 1);
  await swipe(page, 1);
  expect(await currentPage(page)).toBe(2);
  await page.reload();
  await waitReady(page, 2);
  expect(await currentPage(page)).toBe(2);
  await expect(page.locator('.page-no')).toHaveText('3 / 3');
  // 從書架重新開啟也一樣
  await page.getByRole('button', { name: '‹ 書架' }).click();
  await page.getByText('測試筆記').click();
  await waitReady(page, 2);
  expect(await currentPage(page)).toBe(2);
});

test('iPad 中途接管手勢（pointercancel）時，用最後位置判斷翻頁', async ({ page }) => {
  await fire(page, [
    { type: 'pointerdown', pointerType: 'touch', id: 11, fx: 0.8, fy: 0.5 },
    { type: 'pointermove', pointerType: 'touch', id: 11, fx: 0.5, fy: 0.5 },
    { type: 'pointercancel', pointerType: 'touch', id: 11, fx: 0, fy: 0 },
  ]);
  expect(await currentPage(page)).toBe(1);
});

test('只點一下不翻頁', async ({ page }) => {
  await fire(page, [
    { type: 'pointerdown', pointerType: 'touch', id: 11, fx: 0.5, fy: 0.5 },
    { type: 'pointerup', pointerType: 'touch', id: 11, fx: 0.505, fy: 0.5 },
  ]);
  expect(await currentPage(page)).toBe(0);
});
