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

  // 回書架的按鈕是房屋圖示，不是「＋」
  await expect(page.getByRole('button', { name: '開啟其他筆記本' })).not.toContainText('＋');
  await expect(page.getByRole('button', { name: '開啟其他筆記本' }).locator('svg')).toBeVisible();
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

/** 在分頁 from 上按住 holdMs 後拖到分頁 to 的右半邊放開（合成 touch pointer 事件） */
const dragTab = (page: Page, from: string, to: string, holdMs: number) =>
  page.evaluate(
    async ({ from, to, holdMs }) => {
      const find = (t: string) =>
        [...document.querySelectorAll<HTMLElement>('.top-band .tab')].find((e) => e.textContent!.includes(t))!;
      const src = find(from);
      const a = src.getBoundingClientRect();
      const b = find(to).getBoundingClientRect();
      const fire = (type: string, x: number) =>
        src.querySelector('.tab-title')!.dispatchEvent(
          new PointerEvent(type, { pointerType: 'touch', pointerId: 21, clientX: x, clientY: a.top + a.height / 2, bubbles: true }),
        );
      fire('pointerdown', a.left + 20);
      await new Promise((r) => setTimeout(r, holdMs));
      for (let i = 1; i <= 5; i++) fire('pointermove', a.left + 20 + ((b.right - 10 - a.left - 20) * i) / 5);
      fire('pointerup', b.right - 10);
      src.querySelector<HTMLElement>('.tab-title')!.click(); // 放開後的點擊：拖曳時不應切換分頁
    },
    { from, to, holdMs },
  );

test('長按拖曳分頁排序，順序會記住；沒按住就拖不會排序', async ({ page }) => {
  for (const t of ['一', '二', '三']) await openNewNotebook(page, t);
  await expect(tabTitles(page)).toHaveText(['一', '二', '三']);

  // 沒按住（馬上拖）= 捲動分頁列，不排序
  await dragTab(page, '一', '三', 0);
  await expect(tabTitles(page)).toHaveText(['一', '二', '三']);
  await waitReady(page);

  await tab(page, '三').locator('.tab-title').click();
  await waitReady(page);
  await dragTab(page, '一', '三', 500);
  await expect(tabTitles(page)).toHaveText(['二', '三', '一']);
  await expect(activeTitle(page)).toHaveText('三'); // 拖曳放開不會切到被拖的分頁
  await page.reload();
  await waitReady(page);
  await expect(tabTitles(page)).toHaveText(['二', '三', '一']);
});
