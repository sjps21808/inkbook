import { expect, test, type Page } from '@playwright/test';
import { drawStroke, hLine, openMenu, waitReady } from './helpers/pen';

/** 從書架新增一本筆記本（網址帶 search，例如 ?debug=1） */
async function openNotebook(page: Page, search: string) {
  await page.goto(`./${search}`);
  await page.getByRole('button', { name: '新增筆記本' }).click();
  await page.getByLabel('筆記本標題').fill('除錯');
  await page.getByRole('button', { name: '建立' }).click();
  await waitReady(page);
  await openMenu(page);
}

test('一般模式沒有「匯出最後一筆」', async ({ page }) => {
  await openNotebook(page, '');
  await expect(page.getByRole('button', { name: '匯出最後一筆' })).toHaveCount(0);
});

test('除錯模式：匯出最後一筆的原始點（A4 座標）、線寬、工具與裝置資訊', async ({ page }) => {
  // 強制走 <a download> fallback（Windows 的 WebKit 沒有分享面板）
  await page.addInitScript(() => Object.defineProperty(navigator, 'canShare', { value: undefined }));
  await openNotebook(page, '?debug=1');
  await drawStroke(page, hLine(0.2)); // 第一筆
  await drawStroke(page, hLine(0.5)); // 最後一筆：y = 0.5，x 從 0.2 到 0.8，13 個點

  const downloadP = page.waitForEvent('download');
  await page.getByRole('button', { name: '匯出最後一筆' }).click();
  const download = await downloadP;
  expect(download.suggestedFilename()).toBe('inkbook-stroke.json');
  const stream = await download.createReadStream();
  let text = '';
  for await (const chunk of stream) text += chunk;
  const dump = JSON.parse(text);

  expect(dump).toMatchObject({ tool: 'pen', width: 3 });
  expect(dump.app).toMatch(/^\d+\.\d+\.\d+$/);
  expect(dump.devicePixelRatio).toBeGreaterThan(0);
  expect(dump.pageWidthPx).toBeGreaterThan(0);
  expect(dump.points).toHaveLength(13 * 3);
  // 原始點：A4 座標
  expect(dump.points[0]).toBeCloseTo(0.2 * 595, 0);
  expect(dump.points[1]).toBeCloseTo(0.5 * 842, 0);
  expect(dump.points[36]).toBeCloseTo(0.8 * 595, 0);
});
