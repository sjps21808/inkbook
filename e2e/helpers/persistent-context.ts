import { test as base, devices, webkit } from '@playwright/test';

/**
 * WebKit 的臨時 context（等同無痕模式）無法把 Blob 存進 IndexedDB（UnknownError），
 * iPad 主畫面 App 則是持久儲存。需要存圖片 blob 的測試改用持久 context
 * （userDataDir 傳空字串 = Playwright 自動建立並清除暫存資料夾）。
 */
export const test = base.extend({
  page: async ({ baseURL }, use) => {
    const ctx = await webkit.launchPersistentContext('', {
      ...devices['iPad Pro 11'],
      baseURL,
      serviceWorkers: 'block',
    });
    await use(ctx.pages()[0] ?? (await ctx.newPage()));
    await ctx.close();
  },
});

export { expect } from '@playwright/test';
