import { expect, test, type Page } from '@playwright/test';

import { menuOpenByDefault } from './helpers/pen';

test.beforeEach(({ page }) => menuOpenByDefault(page));

async function newFolder(page: Page, name: string) {
  await page.getByRole('button', { name: '新增資料夾' }).click();
  await page.getByLabel('資料夾名稱').fill(name);
  await page.getByRole('button', { name: '建立' }).click();
}

async function newNotebook(page: Page, title: string) {
  await page.getByRole('button', { name: '新增筆記本' }).click();
  await page.getByLabel('筆記本標題').fill(title);
  await page.getByRole('button', { name: '建立' }).click();
  await expect(page.locator('.nb-title')).toHaveText(title);
  await page.getByRole('button', { name: '‹ 書架' }).click();
}

const node = (page: Page, name: string) => page.locator('.folder-tree .folder-node', { hasText: name });
const titles = (page: Page) => page.locator('.notebook-card .title');

test('資料夾樹：新增巢狀資料夾，筆記本放在目前的資料夾', async ({ page }) => {
  await page.goto('./');
  await newNotebook(page, '根目錄的筆記');

  await newFolder(page, '學校');
  await expect(node(page, '學校')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.folder-title')).toHaveText('學校');
  await expect(page.getByText('還沒有筆記本')).toBeVisible();

  await newNotebook(page, '國文');
  // 返回書架時停留在原本的資料夾
  await expect(page.locator('.folder-title')).toHaveText('學校');
  await expect(titles(page)).toHaveText(['國文']);

  await newFolder(page, '數學');
  await expect(page.locator('.folder-tree li li .folder-node')).toHaveText(['數學']);
  await newNotebook(page, '微積分');
  await expect(titles(page)).toHaveText(['微積分']);

  await node(page, '書架').click();
  await expect(titles(page)).toHaveText(['根目錄的筆記']);
  await node(page, '學校').click();
  await expect(titles(page)).toHaveText(['國文']);

  await page.reload();
  await expect(page.locator('.folder-tree .folder-node')).toHaveText(['書架', '學校', '數學']);
});

const menu = async (page: Page, name: string, item: '重新命名' | '移動' | '刪除') => {
  await page.getByRole('button', { name: `${name} 選項` }).click();
  await page.getByRole('menuitem', { name: item }).click();
};

test('重新命名與移動筆記本、資料夾', async ({ page }) => {
  await page.goto('./');
  await newNotebook(page, '草稿');
  await newFolder(page, '工作');
  await node(page, '書架').click();
  await newFolder(page, '私人');

  await node(page, '書架').click();
  await menu(page, '草稿', '重新命名');
  await page.getByLabel('新名稱').fill('會議紀錄');
  await page.getByRole('button', { name: '確定' }).click();
  await expect(titles(page)).toHaveText(['會議紀錄']);

  await menu(page, '會議紀錄', '移動');
  const dialog = page.getByRole('dialog', { name: '移動到' });
  await expect(dialog.getByRole('button', { name: '書架' })).toBeDisabled(); // 目前位置
  await dialog.getByRole('button', { name: '工作' }).click();
  await expect(page.getByText('還沒有筆記本')).toBeVisible();
  await node(page, '工作').click();
  await expect(titles(page)).toHaveText(['會議紀錄']);

  // 資料夾不能移到自己底下；移到「私人」裡
  await menu(page, '工作', '移動');
  await expect(dialog.getByRole('button', { name: '工作' })).toHaveCount(0);
  await dialog.getByRole('button', { name: '私人' }).click();
  await expect(page.locator('.folder-tree li li .folder-node')).toHaveText(['工作']);

  await menu(page, '私人', '重新命名');
  await page.getByLabel('新名稱').fill('個人');
  await page.getByRole('button', { name: '確定' }).click();
  await page.reload();
  await expect(page.locator('.folder-tree .folder-node')).toHaveText(['書架', '個人', '工作']);
});

test('刪除需要二次確認；取消不會刪除，資料夾會連同內容一起刪除', async ({ page }) => {
  await page.goto('./');
  await newNotebook(page, '保留');
  await newFolder(page, '舊資料');
  await newNotebook(page, '舊筆記');
  await newFolder(page, '更舊');
  await newNotebook(page, '更舊的筆記');

  await node(page, '書架').click();
  await menu(page, '保留', '刪除');
  await expect(page.getByRole('dialog', { name: '確認刪除' })).toContainText('此動作無法復原');
  await page.getByRole('button', { name: '取消' }).click();
  await expect(titles(page)).toHaveText(['保留']);

  await menu(page, '舊資料', '刪除');
  const dialog = page.getByRole('dialog', { name: '確認刪除' });
  await expect(dialog).toContainText('將刪除 2 個資料夾（含子資料夾）與 2 本筆記本');
  await dialog.getByRole('button', { name: '刪除' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.folder-tree .folder-node')).toHaveText(['書架']);

  await menu(page, '保留', '刪除');
  await dialog.getByRole('button', { name: '刪除' }).click();
  await expect(page.getByText('還沒有筆記本')).toBeVisible();
  await page.reload();
  await expect(page.getByText('還沒有筆記本')).toBeVisible();
  const counts = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const req = indexedDB.open('inkbook');
        req.onsuccess = () => {
          const tx = req.result.transaction(['folders', 'notebooks', 'pages']);
          const out: number[] = [];
          for (const s of ['folders', 'notebooks', 'pages']) {
            const c = tx.objectStore(s).count();
            c.onsuccess = () => out.push(c.result);
          }
          tx.oncomplete = () => resolve(out);
        };
      }),
  );
  expect(counts).toEqual([0, 0, 0]);
});
