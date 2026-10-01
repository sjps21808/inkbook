import { expect, test, type Page } from '@playwright/test';

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
