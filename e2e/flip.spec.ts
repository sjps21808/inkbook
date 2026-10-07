import { expect, test, type Page } from '@playwright/test';
import { currentPage, openNewNotebook, pageCount, seedPages, swipe, waitReady } from './helpers/pen';

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

/** DB 中依 order 排列的頁面模板 */
const templates = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const req = indexedDB.open('inkbook');
        req.onsuccess = () => {
          const q = req.result.transaction('pages').objectStore('pages').getAll();
          q.onsuccess = () => {
            resolve(
              (q.result as { order: number; template: string }[]).sort((a, b) => a.order - b.order).map((p) => p.template),
            );
            req.result.close();
          };
        };
      }),
  );

test('第一頁往前翻：停在原頁，頁數不變', async ({ page }) => {
  await swipe(page, -1);
  expect(await currentPage(page)).toBe(0);
  expect(await pageCount(page)).toBe(3);
});

test('最後一頁往後翻：新增一頁（模板同最後一頁）並翻過去，復原後移除並翻回', async ({ page }) => {
  // 在最後加一頁方格（新增頁面插在目前頁後面，先翻到最後），確認新頁沿用的是最後一頁的模板
  await swipe(page, 1);
  await swipe(page, 1);
  expect(await currentPage(page)).toBe(2);
  await page.getByRole('button', { name: '新增頁面', exact: true }).click();
  await page.getByRole('menuitem', { name: '方格' }).click();
  await expect.poll(() => pageCount(page)).toBe(4);
  await expect.poll(() => currentPage(page)).toBe(3);

  await swipe(page, 1);
  await expect.poll(() => pageCount(page)).toBe(5);
  await expect.poll(() => currentPage(page)).toBe(4);
  expect((await templates(page))[4]).toBe('grid');
  await expect(page.locator('.page-no')).toHaveText('5 / 5');

  await page.getByRole('button', { name: '復原', exact: true }).click();
  await expect.poll(() => pageCount(page)).toBe(4);
  await expect.poll(() => currentPage(page)).toBe(3);
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
  // 最後一頁按「›」= 新增一頁並翻過去
  await next.click();
  await expect(no).toHaveText('4 / 4');
  expect(await pageCount(page)).toBe(4);
  await prev.click();
  await expect(no).toHaveText('3 / 4');
  // 滑動翻頁也會更新頁碼
  await swipe(page, -1);
  await expect(no).toHaveText('2 / 4');
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
  await page.locator('.notebook-card', { hasText: '測試筆記' }).click();
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

/** 第 index 頁左緣在畫面上的 x（拖動中不加動畫，可以直接比較位移） */
const pageLeft = (page: Page, index: number) =>
  page.evaluate((i) => document.querySelector(`.page[data-index="${i}"]`)!.getBoundingClientRect().left, index);
const nextFrame = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
const pageWidth = (page: Page) =>
  page.evaluate(() => document.querySelector('.page')!.getBoundingClientRect().width);

test('拖動時頁面跟著手指走，沒翻頁時放開彈回原位', async ({ page }) => {
  const w = await pageWidth(page);
  const left0 = await pageLeft(page, 0);
  const d = 12 / w; // 拖 12px（超過 8px 才開始跟手）
  await fire(page, [
    { type: 'pointerdown', pointerType: 'touch', id: 11, fx: 0.6, fy: 0.5 },
    { type: 'pointermove', pointerType: 'touch', id: 11, fx: 0.6 - d, fy: 0.5 },
  ]);
  await nextFrame(page);
  expect(await pageLeft(page, 0)).toBeCloseTo(left0 - 12, 0);
  // 下一頁跟著一起移動
  expect(await pageLeft(page, 1)).toBeLessThan(left0 + (await page.evaluate(() => document.querySelector('.pages')!.clientWidth)) + 16);

  await fire(page, [{ type: 'pointerup', pointerType: 'touch', id: 11, fx: 0.6, fy: 0.5 }]);
  expect(await currentPage(page)).toBe(0);
  await expect.poll(() => pageLeft(page, 0)).toBeCloseTo(left0, 0);
});

test('最後一頁往後拖：只移動一半；拖不夠遠放開不新增，拖超過 35% 出現提示並新增', async ({ page }) => {
  await swipe(page, 1);
  await swipe(page, 1);
  expect(await currentPage(page)).toBe(2);
  await waitReady(page, 2);
  const w = await pageWidth(page);
  // 等翻頁動畫結束：第 3 頁停在置中的位置
  const left = await page.evaluate(() => {
    const c = document.querySelector('.pages')!.getBoundingClientRect();
    const w = document.querySelector('.page')!.getBoundingClientRect().width;
    return c.left + (c.width - w) / 2;
  });
  await expect.poll(() => pageLeft(page, 2)).toBeCloseTo(left, 0);

  // 拖頁寬 10%：頁面只移動 5%，沒有提示；放開不新增
  await fire(page, [
    { type: 'pointerdown', pointerType: 'touch', id: 11, fx: 0.6, fy: 0.5 },
    { type: 'pointermove', pointerType: 'touch', id: 11, fx: 0.5, fy: 0.5 },
  ]);
  await nextFrame(page);
  expect(await pageLeft(page, 2)).toBeCloseTo(left - 0.05 * w, 0);
  await expect(page.locator('.pages')).not.toHaveAttribute('data-add-armed');
  await fire(page, [{ type: 'pointerup', pointerType: 'touch', id: 11, fx: 0.5, fy: 0.5 }]);
  await expect.poll(() => pageLeft(page, 2)).toBeCloseTo(left, 0);
  expect(await pageCount(page)).toBe(3);

  // 快速輕撥（30px）不新增
  await fire(page, [
    { type: 'pointerdown', pointerType: 'touch', id: 11, fx: 0.6, fy: 0.5 },
    { type: 'pointerup', pointerType: 'touch', id: 11, fx: 0.6 - 30 / w, fy: 0.5 },
  ]);
  expect(await pageCount(page)).toBe(3);

  // 拖頁寬 30%：還不到 35%，沒有提示
  await fire(page, [
    { type: 'pointerdown', pointerType: 'touch', id: 11, fx: 0.8, fy: 0.5 },
    { type: 'pointermove', pointerType: 'touch', id: 11, fx: 0.5, fy: 0.5 },
  ]);
  await nextFrame(page);
  await expect(page.locator('.pages')).not.toHaveAttribute('data-add-armed');
  // 繼續拖到 40%：出現提示，放開新增並翻過去
  await fire(page, [{ type: 'pointermove', pointerType: 'touch', id: 11, fx: 0.4, fy: 0.5 }]);
  await expect(page.locator('.pages')).toHaveAttribute('data-add-armed', '');
  await expect(page.locator('.add-hint')).toHaveCSS('opacity', '1');
  await fire(page, [{ type: 'pointerup', pointerType: 'touch', id: 11, fx: 0.4, fy: 0.5 }]);
  await expect.poll(() => pageCount(page)).toBe(4);
  await expect.poll(() => currentPage(page)).toBe(3);
  await expect(page.locator('.pages')).not.toHaveAttribute('data-add-armed');
});

test('第一頁往前拖：只移動一半並彈回', async ({ page }) => {
  const w = await pageWidth(page);
  const left0 = await pageLeft(page, 0);
  await fire(page, [
    { type: 'pointerdown', pointerType: 'touch', id: 11, fx: 0.3, fy: 0.5 },
    { type: 'pointermove', pointerType: 'touch', id: 11, fx: 0.5, fy: 0.5 },
  ]);
  await nextFrame(page);
  expect(await pageLeft(page, 0)).toBeCloseTo(left0 + 0.1 * w, 0);
  await fire(page, [{ type: 'pointerup', pointerType: 'touch', id: 11, fx: 0.5, fy: 0.5 }]);
  expect(await currentPage(page)).toBe(0);
  await expect.poll(() => pageLeft(page, 0)).toBeCloseTo(left0, 0);
});

test('翻頁動畫還沒播完就再拖：頁面從看得到的位置接著動，不會跳；放開後翻到再下一頁', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const frame = () => new Promise((res) => requestAnimationFrame(() => res(null)));
    const pages = document.querySelector<HTMLElement>('.pages')!;
    const fire = (type: string, fx: number) => {
      const target = document.querySelector(`.page[data-index="${pages.dataset.current}"] .overlay`)!;
      const rect = target.getBoundingClientRect();
      target.dispatchEvent(
        new PointerEvent(type, {
          pointerType: 'touch',
          pointerId: 11,
          clientX: rect.left + fx * rect.width,
          clientY: rect.top + rect.height / 2,
          bubbles: true,
        }),
      );
    };
    const left = (i: number) => document.querySelector(`.page[data-index="${i}"]`)!.getBoundingClientRect().left;
    // 第一次翻頁（0 → 1），動畫播到一半
    fire('pointerdown', 0.8);
    fire('pointermove', 0.5);
    fire('pointerup', 0.2);
    // 等 Preact 套用新位置、動畫開始後暫停在 100ms（不受機器快慢影響，確定停在半路）
    await new Promise((res) => setTimeout(res, 0));
    const track = document.querySelector<HTMLElement>('.pages-track')!;
    getComputedStyle(track).transform;
    const anim = track.getAnimations()[0];
    if (!anim) return null;
    anim.pause();
    anim.currentTime = 100;
    const before = left(1);
    // 馬上再拖 12px（同一個 task 內讀位置與開始拖動）
    const w = document.querySelector('.page')!.getBoundingClientRect().width;
    fire('pointerdown', 0.6);
    fire('pointermove', 0.6 - 12 / w);
    // 開始拖動的當下頁面停在看得到的位置（位移下一個 frame 才套用）
    const frozen = left(1);
    const animations = track.getAnimations().length;
    await frame();
    await frame();
    const during = left(1);
    const centered = (() => {
      const c = pages.getBoundingClientRect();
      return c.left + (c.width - w) / 2;
    })();
    return { before, frozen, during, centered, animations };
  });
  expect(r).not.toBeNull(); // 翻頁有動畫
  // 動畫中途：第 2 頁還沒到中間
  expect(r!.before).toBeGreaterThan(r!.centered + 20);
  // 開始拖動時停在看得到的位置，動畫停止
  expect(r!.frozen).toBeCloseTo(r!.before, 0);
  expect(r!.animations).toBe(0);
  // 之後從停住的位置跟著手指往左 12px（舊版會直接跳到「中間 − 12px」）
  expect(r!.during).toBeCloseTo(r!.frozen - 12, 0);

  // 放開（快速輕撥）→ 翻到第 3 頁，最後停在中間
  await fire(page, [{ type: 'pointerup', pointerType: 'touch', id: 11, fx: 0.2, fy: 0.5 }]);
  await expect.poll(() => currentPage(page)).toBe(2);
  await waitReady(page, 2);
  await expect.poll(() => pageLeft(page, 2)).toBeCloseTo(r!.centered, 0);
});

test('頁面上的單指、雙指 touchmove 都擋掉原生捲動與縮放（全部由 App 處理）', async ({ page }) => {
  const prevented = (touches: number) =>
    page.evaluate((touches) => {
      const target = document.querySelector('.page[data-index="0"] .overlay')!;
      const e = new TouchEvent('touchmove', { cancelable: true, bubbles: true });
      if (touches > 1) Object.defineProperty(e, 'touches', { value: { length: touches } });
      target.dispatchEvent(e);
      return e.defaultPrevented;
    }, touches);
  expect(await prevented(1)).toBe(true);
  expect(await prevented(2)).toBe(true);
});
