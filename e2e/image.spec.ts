import { test as ephemeral, type Page } from '@playwright/test';
import { expect, test } from './helpers/persistent-context';
import { drawStroke, elementCount, inkPixel, openNewNotebook, waitReady } from './helpers/pen';

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

/** 點「圖片」，在檔案選擇器選一張 w×h 的純綠色 PNG（在瀏覽器內產生） */
async function pickGreenPng(page: Page, w: number, h: number) {
  const chooser = page.waitForEvent('filechooser');
  await button(page, '圖片').click();
  await (await chooser).element().evaluate(
    async (input: HTMLInputElement, { w, h }) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#00ff00';
      ctx.fillRect(0, 0, w, h);
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
      const dt = new DataTransfer();
      dt.items.add(new File([blob!], 'green.png', { type: 'image/png' }));
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
    },
    { w, h },
  );
}

async function insertImage(page: Page, w: number, h: number) {
  await pickGreenPng(page, w, h);
  await expect.poll(() => elementCount(page)).toBe(1);
}

const isGreen = async (page: Page, at: [number, number]) => {
  const [r, g, b, a] = await inkPixel(page, at);
  return a === 255 && g > 200 && r < 60 && b < 60;
};

/** blobs 裡第一張圖片的像素尺寸 */
const storedSize = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<[number, number]>((resolve, reject) => {
        const req = indexedDB.open('inkbook');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const r = req.result.transaction('blobs').objectStore('blobs').getAll();
          r.onsuccess = async () => {
            const bmp = await createImageBitmap(r.result[0].data);
            resolve([bmp.width, bmp.height]);
          };
        };
      }),
  );

test.beforeEach(async ({ page }) => {
  await openNewNotebook(page);
});

test('插入圖片：放在頁面中央、自動選取，重新整理後還在', async ({ page }) => {
  await insertImage(page, 200, 100);
  await expect.poll(() => isGreen(page, [0.5, 0.5])).toBe(true);
  expect(await isGreen(page, [0.5, 0.3])).toBe(false);
  await expect(button(page, '套索')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.selection')).toBeVisible();

  await page.reload();
  await waitReady(page);
  await expect.poll(() => isGreen(page, [0.5, 0.5])).toBe(true);
});

test('用套索移動圖片，undo 移回、再 undo 移除', async ({ page }) => {
  await insertImage(page, 200, 100);
  await drawStroke(page, [
    [0.5, 0.5],
    [0.5, 0.6],
    [0.5, 0.7],
  ]);
  await expect.poll(() => isGreen(page, [0.5, 0.7])).toBe(true);
  expect(await isGreen(page, [0.5, 0.45])).toBe(false);
  await button(page, '復原').click();
  await expect.poll(() => isGreen(page, [0.5, 0.45])).toBe(true);
  await button(page, '復原').click();
  await expect.poll(() => elementCount(page)).toBe(0);
  await expect.poll(() => isGreen(page, [0.5, 0.5])).toBe(false);
});

test('大圖匯入時長邊縮到 2048px', async ({ page }) => {
  await insertImage(page, 3000, 1000);
  expect(await storedSize(page)).toEqual([2048, 683]);
  await expect.poll(() => isGreen(page, [0.5, 0.5])).toBe(true);
});

test('縮圖也畫出圖片', async ({ page }) => {
  await insertImage(page, 200, 100);
  await button(page, '頁面').click();
  const img = page.locator('.thumb[data-thumb-index="0"] img');
  await expect(img).toBeVisible();
  await expect
    .poll(() =>
      img.evaluate(async (el: HTMLImageElement) => {
        await el.decode();
        const c = document.createElement('canvas');
        c.width = el.naturalWidth;
        c.height = el.naturalHeight;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(el, 0, 0);
        const [r, g, b] = ctx.getImageData(c.width / 2, c.height / 2, 1, 1).data;
        return g > 200 && r < 60 && b < 60;
      }),
    )
    .toBe(true);
});

ephemeral('無痕模式（Blob 無法存進 IndexedDB）時提示無法儲存', async ({ page }) => {
  await openNewNotebook(page);
  const dialog = page.waitForEvent('dialog');
  await pickGreenPng(page, 20, 20);
  const d = await dialog;
  expect(d.message()).toContain('無法儲存圖片');
  await d.dismiss();
  expect(await elementCount(page)).toBe(0);
});
