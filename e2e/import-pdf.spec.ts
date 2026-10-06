import { test as ephemeral } from '@playwright/test';
import { expect, test } from './helpers/persistent';
import { pageCount, waitReady, menuOpenByDefault } from './helpers/pen';
import { importPdfFile, makePdf, toBuffer } from './helpers/pdf';

test.beforeEach(({ page }) => menuOpenByDefault(page));

test('匯入混合尺寸的 PDF：建立筆記本並開啟，每個 PDF 頁一頁', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });

  await importPdfFile(page, await makePdf([[595, 842], [612, 792], [842, 595]]), '微積分講義.pdf');
  await expect(page.locator('.nb-title')).toHaveText('微積分講義');
  await waitReady(page);
  await expect(page.locator('.pages')).toHaveAttribute('data-current', '0');
  expect(await pageCount(page)).toBe(3);
  const pdfs = await page.evaluate(
    () =>
      new Promise<unknown[]>((resolve) => {
        const req = indexedDB.open('inkbook');
        req.onsuccess = () => {
          const r = req.result.transaction('pages').objectStore('pages').getAll();
          r.onsuccess = () => resolve((r.result as { order: number; pdf: unknown }[]).sort((a, b) => a.order - b.order).map((p) => p.pdf));
        };
      }),
  );
  expect(pdfs).toEqual([
    expect.objectContaining({ pageNo: 1, srcWidth: 595, srcHeight: 842 }),
    expect.objectContaining({ pageNo: 2, srcWidth: 612, srcHeight: 792 }),
    expect.objectContaining({ pageNo: 3, srcWidth: 842, srcHeight: 595 }),
  ]);

  await page.getByRole('button', { name: '‹ 書架' }).click();
  await expect(page.locator('.notebook-card .title')).toHaveText(['微積分講義']);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
});

test('超過 500 頁時提示，不建立筆記本', async ({ page }) => {
  const pdf = await makePdf(Array.from({ length: 501 }, () => [200, 200] as [number, number]));
  const dialog = page.waitForEvent('dialog');
  await importPdfFile(page, pdf);
  const d = await dialog;
  expect(d.message()).toContain('500 頁');
  await d.dismiss();
  await expect(page.getByText('還沒有筆記本')).toBeVisible();
  expect(await pageCount(page)).toBe(0);
});

test('不是 PDF 的檔案會提示無法讀取', async ({ page }) => {
  const dialog = page.waitForEvent('dialog');
  await importPdfFile(page, toBuffer('hello'), 'fake.pdf');
  const d = await dialog;
  expect(d.message()).toContain('無法讀取');
  await d.dismiss();
  await expect(page.getByText('還沒有筆記本')).toBeVisible();
});

ephemeral('無痕模式（Blob 無法存進 IndexedDB）時提示無法儲存，不留下筆記本', async ({ page }) => {
  const dialog = page.waitForEvent('dialog');
  await importPdfFile(page, await makePdf([[595, 842]]));
  const d = await dialog;
  expect(d.message()).toContain('無法儲存');
  await d.dismiss();
  await expect(page.getByText('還沒有筆記本')).toBeVisible();
  expect(await pageCount(page)).toBe(0);
  // 資料庫沒有卡住，仍然可以新增筆記本
  await page.getByRole('button', { name: '新增筆記本' }).click();
  await page.getByRole('button', { name: '建立' }).click();
  await expect(page.locator('.nb-title')).toHaveText('未命名筆記本');
});
