import { expect, test, type Page } from '@playwright/test';
import { drawStroke, elementCount, hLine, inkPixel, waitReady, menuOpenByDefault } from './helpers/pen';

test.beforeEach(({ page }) => menuOpenByDefault(page));

const lastBackupAt = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number | null>((resolve) => {
        const req = indexedDB.open('inkbook');
        req.onsuccess = () => {
          const g = req.result.transaction('meta').objectStore('meta').get('lastBackupAt');
          g.onsuccess = () => resolve(g.result?.value ?? null);
        };
      }),
  );

async function newFolder(page: Page, name: string) {
  await page.getByRole('button', { name: '新增資料夾' }).click();
  await page.getByLabel('資料夾名稱').fill(name);
  await page.getByRole('button', { name: '建立' }).click();
}

const titles = (page: Page) => page.locator('.notebook-card .title');

test.describe('不支援分享時', () => {
  test.beforeEach(async ({ page }) => {
    // 強制走 <a download> fallback
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', { value: undefined });
    });
  });

  test('備份下載後，合併與覆蓋還原都能取回筆記', async ({ page }, testInfo) => {
    await page.goto('./');
    await newFolder(page, '學校');
    await page.getByRole('button', { name: '新增筆記本' }).click();
    await page.getByLabel('筆記本標題').fill('數學');
    await page.getByRole('button', { name: '建立' }).click();
    await waitReady(page);
    await drawStroke(page, hLine(0.3));
    await expect.poll(() => elementCount(page)).toBe(1);
    await page.getByRole('button', { name: '‹ 書架' }).click();
    expect(await lastBackupAt(page)).toBeNull();

    // 備份
    await page.getByRole('button', { name: '備份', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '備份' })).toContainText(/inkbook-\d{8}-\d{4}\.inkbak/);
    const downloadP = page.waitForEvent('download');
    await page.getByRole('button', { name: '分享／儲存' }).click();
    const download = await downloadP;
    expect(download.suggestedFilename()).toMatch(/^inkbook-\d{8}-\d{4}\.inkbak$/);
    const path = testInfo.outputPath('backup.inkbak');
    await download.saveAs(path);
    await expect(page.getByRole('dialog', { name: '備份' })).toHaveCount(0);
    expect(await lastBackupAt(page)).toBeGreaterThan(Date.now() - 60_000);

    // 刪掉資料夾（連同筆記本），另外建立一本
    await page.getByRole('button', { name: '學校 選項' }).click();
    await page.getByRole('menuitem', { name: '刪除' }).click();
    await page.getByRole('dialog', { name: '確認刪除' }).getByRole('button', { name: '刪除' }).click();
    await page.getByRole('button', { name: '新增筆記本' }).click();
    await page.getByLabel('筆記本標題').fill('本機');
    await page.getByRole('button', { name: '建立' }).click();
    await page.getByRole('button', { name: '‹ 書架' }).click();

    const restore = async (mode: '合併' | '覆蓋') => {
      const chooserP = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: '還原', exact: true }).click();
      await (await chooserP).setFiles(path);
      const dialog = page.getByRole('dialog', { name: '還原備份' });
      await expect(dialog).toContainText('共 1 本筆記本、1 個資料夾');
      if (mode === '覆蓋') {
        await dialog.getByRole('button', { name: '覆蓋' }).click();
        await expect(dialog).toContainText('無法復原');
        await dialog.getByRole('button', { name: '確定覆蓋' }).click();
      } else {
        await dialog.getByRole('button', { name: '合併' }).click();
      }
      await page.getByRole('dialog', { name: '還原完成' }).getByRole('button', { name: '好' }).click();
    };

    await restore('合併');
    await expect(titles(page)).toHaveText(['本機']);
    await page.locator('.folder-tree .folder-node', { hasText: '學校' }).click();
    await expect(titles(page)).toHaveText(['數學']);

    await restore('覆蓋');
    await expect(page.locator('.folder-tree .folder-node')).toHaveText(['書架', '學校']);
    await page.locator('.folder-tree .folder-node', { hasText: '書架' }).click();
    await expect(page.getByText('還沒有筆記本')).toBeVisible();

    await page.locator('.folder-tree .folder-node', { hasText: '學校' }).click();
    await page.locator('.notebook-card', { hasText: '數學' }).click();
    await waitReady(page);
    await expect.poll(async () => (await inkPixel(page, [0.5, 0.3]))[3]).toBe(255);
  });

  test('選到不是備份的檔案時顯示錯誤', async ({ page }) => {
    await page.goto('./');
    const chooserP = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '還原', exact: true }).click();
    await (await chooserP).setFiles('public/icons/icon-192.png');
    await expect(page.getByRole('dialog', { name: '無法還原' })).toContainText('不是有效的 InkBook 備份檔');
  });
});

test('支援分享時用 navigator.share；取消分享不記錄備份時間', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { shared: string[]; cancelShare: boolean };
    w.shared = [];
    w.cancelShare = true;
    Object.defineProperty(navigator, 'canShare', { value: () => true });
    Object.defineProperty(navigator, 'share', {
      value: async ({ files }: { files: File[] }) => {
        if (w.cancelShare) throw new DOMException('cancel', 'AbortError');
        w.shared.push(files[0].name);
      },
    });
  });
  await page.goto('./');
  await page.getByRole('button', { name: '備份', exact: true }).click();
  await page.getByRole('button', { name: '分享／儲存' }).click();
  await expect(page.getByRole('dialog', { name: '備份' })).toBeVisible();
  expect(await lastBackupAt(page)).toBeNull();

  await page.evaluate(() => ((window as unknown as { cancelShare: boolean }).cancelShare = false));
  await page.getByRole('button', { name: '分享／儲存' }).click();
  await expect(page.getByRole('dialog', { name: '備份' })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { shared: string[] }).shared)).toHaveLength(1);
  expect(await lastBackupAt(page)).not.toBeNull();
});
