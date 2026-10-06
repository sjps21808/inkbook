import { expect, test, type Page } from '@playwright/test';
import { drawStroke, elementCount, openNewNotebook, pickColor, waitReady, type Pt } from './helpers/pen';

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

/** 用筆點一下 */
const tap = (page: Page, at: Pt) => drawStroke(page, [at]);

/** IndexedDB 裡的文字 element */
const texts = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ content: string; color: string; fontSize: number }[]>((resolve, reject) => {
        const req = indexedDB.open('inkbook');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const r = req.result.transaction('elements').objectStore('elements').getAll();
          r.onsuccess = () => {
            resolve(r.result.filter((e) => e.type === 'text'));
            req.result.close();
          };
        };
      }),
  );

const editor = (page: Page) => page.locator('.text-el[contenteditable]');

test.beforeEach(async ({ page }) => {
  await openNewNotebook(page);
  await button(page, '文字').click();
});

test('點一下新增文字框，輸入後點別處存檔，重新整理後還在', async ({ page }) => {
  await pickColor(page, '紅');
  await tap(page, [0.3, 0.3]);
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type('你好 InkBook');
  await tap(page, [0.5, 0.8]); // 點別處：結束編輯（另開的空白文字框不會存）
  await expect.poll(() => texts(page)).toEqual([
    expect.objectContaining({ content: '你好 InkBook', color: '#e53935', fontSize: 16 }),
  ]);
  await button(page, '筆').click();
  await expect.poll(() => elementCount(page)).toBe(1);

  await page.reload();
  await waitReady(page);
  await expect(page.locator('.text-el')).toHaveText('你好 InkBook');
});

test('沒有輸入內容的文字框不會存檔', async ({ page }) => {
  await tap(page, [0.3, 0.3]);
  await expect(editor(page)).toBeFocused();
  await button(page, '筆').click();
  await expect(editor(page)).toHaveCount(0);
  expect(await elementCount(page)).toBe(0);
  await expect(button(page, '復原')).toBeDisabled();
});

test('點既有的文字框可以修改，undo 還原原本的內容', async ({ page }) => {
  await tap(page, [0.3, 0.3]);
  await page.keyboard.type('第一版');
  await button(page, '筆').click();
  await expect.poll(async () => (await texts(page))[0]?.content).toBe('第一版');

  await button(page, '文字').click();
  await tap(page, [0.31, 0.3]);
  await expect(editor(page)).toHaveText('第一版');
  await page.keyboard.type('改');
  await button(page, '筆').click();
  await expect.poll(async () => (await texts(page))[0]?.content).toBe('第一版改');
  expect(await elementCount(page)).toBe(1);

  await button(page, '復原').click();
  await expect.poll(async () => (await texts(page))[0]?.content).toBe('第一版');
  await expect(page.locator('.text-el')).toHaveText('第一版');
});

test('清空文字框 = 刪除', async ({ page }) => {
  await tap(page, [0.3, 0.3]);
  await page.keyboard.type('ab');
  await button(page, '筆').click();
  await expect.poll(() => elementCount(page)).toBe(1);
  await button(page, '文字').click();
  await tap(page, [0.31, 0.3]);
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await button(page, '筆').click();
  await expect.poll(() => elementCount(page)).toBe(0);
});

test('套索可以移動文字框', async ({ page }) => {
  await tap(page, [0.3, 0.3]);
  await page.keyboard.type('移動我');
  await button(page, '套索').click();
  await expect.poll(() => elementCount(page)).toBe(1);
  const top = () => page.locator('.text-el').evaluate((el) => el.getBoundingClientRect().top);
  const before = await top();
  await drawStroke(page, [
    [0.1, 0.25],
    [0.6, 0.25],
    [0.6, 0.35],
    [0.1, 0.35],
  ]);
  await expect(page.locator('.selection')).toBeVisible();
  await drawStroke(page, [
    [0.32, 0.3],
    [0.32, 0.4],
    [0.32, 0.5],
  ]);
  await expect.poll(async () => (await top()) - before).toBeGreaterThan(100);
});
