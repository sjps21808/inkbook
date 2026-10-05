import { expect, test, type Page } from '@playwright/test';
import { drawStroke, hLine, openNewNotebook, seedPages, waitReady } from './helpers/pen';

const toggle = (page: Page) => page.getByRole('button', { name: '頁面', exact: true }).click();
const thumbSrc = (page: Page, i: number) =>
  page.locator(`.thumb[data-thumb-index="${i}"] img`).getAttribute('src');

/** DB 中頁面 id 依 order 排列 */
const pageOrder = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const req = indexedDB.open('inkbook');
        req.onsuccess = () => {
          const q = req.result.transaction('pages').objectStore('pages').getAll();
          q.onsuccess = () => {
            resolve(
              (q.result as { id: string; order: number }[]).sort((a, b) => a.order - b.order).map((p) => p.id),
            );
            req.result.close();
          };
        };
      }),
  );

test.beforeEach(async ({ page }) => {
  await openNewNotebook(page);
  await seedPages(page, 20);
});

test('縮圖數量正確，只有捲到附近的縮圖會產生', async ({ page }) => {
  await toggle(page);
  await expect(page.locator('.thumb')).toHaveCount(20);
  await expect.poll(() => thumbSrc(page, 0)).toMatch(/^blob:/);
  const generated = await page.locator('.thumb img').count();
  expect(generated).toBeGreaterThan(0);
  expect(generated).toBeLessThan(20);
});

test('書寫後縮圖重新產生', async ({ page }) => {
  await toggle(page);
  await expect.poll(() => thumbSrc(page, 0)).toMatch(/^blob:/);
  const before = await thumbSrc(page, 0);
  await drawStroke(page, hLine(0.3));
  await expect.poll(() => thumbSrc(page, 0)).not.toBe(before);
});

test('點縮圖跳到該頁', async ({ page }) => {
  await toggle(page);
  await page.getByRole('button', { name: '第 4 頁' }).click();
  await waitReady(page, 3);
  await expect(page.locator('.pages')).toHaveAttribute('data-current', '3');
  // 跳頁（不相鄰）沒有動畫：第 4 頁立刻完整在畫面內
  const inView = await page.evaluate(() => {
    const r = document.querySelector('.page[data-index="3"]')!.getBoundingClientRect();
    return r.left >= 0 && r.right <= document.documentElement.clientWidth;
  });
  expect(inView).toBe(true);
});

test('拖曳縮圖重新排序，undo 恢復', async ({ page }) => {
  await toggle(page);
  const before = await pageOrder(page);
  const grip = page.getByLabel('拖曳第 1 頁');
  const box = (await grip.boundingBox())!;
  const itemH = (await page.locator('.thumb').first().boundingBox())!.height;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(box.x + box.width / 2, box.y + (itemH * 2 * k) / 10);
  await page.mouse.up();

  const expected = [before[1], before[2], before[0], ...before.slice(3)];
  await expect.poll(() => pageOrder(page)).toEqual(expected);
  await page.getByRole('button', { name: '復原' }).click();
  await expect.poll(() => pageOrder(page)).toEqual(before);
});
