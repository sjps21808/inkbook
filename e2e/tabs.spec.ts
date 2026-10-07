import { expect, test, type Page } from '@playwright/test';
import { openNewNotebook, waitReady } from './helpers/pen';

const tabs = (page: Page) => page.getByRole('tablist', { name: '筆記本分頁' }).getByRole('tab');
const tab = (page: Page, title: string) => tabs(page).filter({ hasText: title });
const tabTitles = (page: Page) => page.locator('[role="tablist"] .tab-title');
const activeTitle = (page: Page) => page.locator('.tab[aria-selected="true"] .tab-title');
const quick = (page: Page) => page.getByRole('toolbar', { name: '快捷工具' });

test('開兩本筆記本：各有分頁，點分頁切換，切回來時恢復工具', async ({ page }) => {
  await openNewNotebook(page, '微積分');
  await quick(page).getByRole('button', { name: '螢光筆' }).click();
  await openNewNotebook(page, '英文');
  await expect(tabTitles(page)).toHaveText(['微積分', '英文']);
  await expect(activeTitle(page)).toHaveText('英文');
  await expect(quick(page).getByRole('button', { name: '筆', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await tab(page, '微積分').locator('.tab-title').click();
  await waitReady(page);
  await expect(activeTitle(page)).toHaveText('微積分');
  await expect(page.locator('.nb-title')).toHaveText('微積分');
  await expect(quick(page).getByRole('button', { name: '螢光筆' })).toHaveAttribute('aria-pressed', 'true');

  // 重開 App 分頁都還在
  await page.reload();
  await waitReady(page);
  await expect(tabTitles(page)).toHaveText(['微積分', '英文']);
});

test('關閉分頁：關目前的切到旁邊，全關回書架；「＋」回書架，書架也有分頁列', async ({ page }) => {
  await openNewNotebook(page, '甲');
  await openNewNotebook(page, '乙');
  await openNewNotebook(page, '丙');
  await tab(page, '乙').locator('.tab-title').click();
  await waitReady(page);

  await page.getByRole('button', { name: '關閉 乙' }).click();
  await expect(tabs(page)).toHaveCount(2);
  await expect(activeTitle(page)).toHaveText('丙'); // 右邊那個

  await page.getByRole('button', { name: '開啟其他筆記本' }).click();
  await expect(page.getByRole('button', { name: '新增筆記本' })).toBeVisible();
  await expect(tabTitles(page)).toHaveText(['甲', '丙']);
  await expect(page.locator('.tab[aria-selected="true"]')).toHaveCount(0);
  // 書架頁關掉分頁不會離開書架
  await page.getByRole('button', { name: '關閉 甲' }).click();
  await expect(tabTitles(page)).toHaveText(['丙']);
  await expect(page.getByRole('button', { name: '新增筆記本' })).toBeVisible();

  await tab(page, '丙').locator('.tab-title').click();
  await waitReady(page);
  await page.getByRole('button', { name: '關閉 丙' }).click();
  await expect(page.getByRole('button', { name: '新增筆記本' })).toBeVisible();
  await expect(page.getByRole('tablist', { name: '筆記本分頁' })).toHaveCount(0);
});

test('書架上改名或刪除，分頁跟著更新', async ({ page }) => {
  await openNewNotebook(page, '草稿');
  await openNewNotebook(page, '待刪');
  await page.getByRole('button', { name: '開啟其他筆記本' }).click();

  await page.getByRole('button', { name: '草稿 選項' }).click();
  await page.getByRole('menuitem', { name: '重新命名' }).click();
  await page.getByLabel('新名稱').fill('定稿');
  await page.getByRole('button', { name: '確定' }).click();
  await expect(tabTitles(page)).toHaveText(['定稿', '待刪']);

  await page.getByRole('button', { name: '待刪 選項' }).click();
  await page.getByRole('menuitem', { name: '刪除' }).click();
  await page.getByRole('dialog', { name: '確認刪除' }).getByRole('button', { name: '刪除' }).click();
  await expect(tabTitles(page)).toHaveText(['定稿']);
});

test('分頁太多時可以左右捲動，目前分頁在看得到的位置', async ({ page }) => {
  for (let i = 1; i <= 7; i++) await openNewNotebook(page, `筆記${i}`);
  const box = await page.evaluate(() => {
    const bar = document.querySelector('.top-band .tabbar')!;
    const act = bar.querySelector('[aria-selected="true"]')!.getBoundingClientRect();
    const r = bar.getBoundingClientRect();
    return { scroll: bar.scrollWidth > bar.clientWidth, inView: act.left >= r.left - 1 && act.right <= r.right + 1 };
  });
  expect(box).toEqual({ scroll: true, inView: true });
  // 白紙仍在頂端固定區域下方
  const top = await page.evaluate(() => ({
    band: document.querySelector('.top-band')!.getBoundingClientRect().bottom,
    page: document.querySelector('.page[data-index="0"]')!.getBoundingClientRect().top,
  }));
  expect(top.page).toBeGreaterThanOrEqual(top.band);
});
