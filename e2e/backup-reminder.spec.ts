import { expect, test, type Page } from '@playwright/test';

import { menuOpenByDefault } from './helpers/pen';

test.beforeEach(({ page }) => menuOpenByDefault(page));

const setLastBackupAt = (page: Page, value: number) =>
  page.evaluate(
    (value) =>
      new Promise<void>((resolve) => {
        const req = indexedDB.open('inkbook');
        req.onsuccess = () => {
          const tx = req.result.transaction('meta', 'readwrite');
          tx.objectStore('meta').put({ key: 'lastBackupAt', value });
          tx.oncomplete = () => resolve();
        };
      }),
    value,
  );

const DAY = 24 * 60 * 60 * 1000;
const bar = (page: Page) => page.locator('.backup-reminder');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: undefined });
  });
});

test('空書架不提示；有筆記本但從未備份時提示，備份後消失', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('還沒有筆記本')).toBeVisible();
  await expect(bar(page)).toHaveCount(0);

  await page.getByRole('button', { name: '新增筆記本' }).click();
  await page.getByRole('button', { name: '建立' }).click();
  await page.getByRole('button', { name: '‹ 書架' }).click();
  await expect(bar(page)).toContainText('還沒有備份過');

  await bar(page).getByRole('button', { name: '立即備份' }).click();
  const downloadP = page.waitForEvent('download');
  await page.getByRole('button', { name: '分享／儲存' }).click();
  await downloadP;
  await expect(bar(page)).toHaveCount(0);
});

test('距離上次備份超過 7 天時提示天數，6 天時不提示', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '新增筆記本' }).click();
  await page.getByRole('button', { name: '建立' }).click();
  await page.getByRole('button', { name: '‹ 書架' }).click();

  await setLastBackupAt(page, Date.now() - 6 * DAY);
  await page.reload();
  await expect(page.locator('.notebook-card')).toHaveCount(1);
  await expect(bar(page)).toHaveCount(0);

  await setLastBackupAt(page, Date.now() - 10 * DAY);
  await page.reload();
  await expect(bar(page)).toContainText('已經 10 天沒有備份了');
});
