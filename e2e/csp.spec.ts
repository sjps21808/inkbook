import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
});

const violations = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);

test('build 的 HTML 帶有 CSP', async ({ page }) => {
  await page.goto('./');
  const content = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(content).toContain("default-src 'self'");
  expect(content).toContain("script-src 'self'");
});

test('一般開啟沒有 CSP 違規', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.page canvas.ink')).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

// 決策（使用者選 A）：維持嚴格 CSP，不放行 eval。eruda 內部用 eval 會被擋，
// 所以 ?debug=1 時只允許 `script-src eval` 這一種違規；console 輸入 JS 執行會受限，但看 log 要能用。
// 決策（使用者選 A1）：eruda 的 data: 圖示字型也被擋（`font-src data`），只影響除錯面板的圖示。
const ERUDA_ALLOWED = ['script-src eval', 'font-src data'];

test('?debug=1 開啟 eruda 時只有 eval 與 data: 字型被擋，且 console 看得到 log', async ({ page }) => {
  await page.goto('./?debug=1');
  await expect(page.locator('#eruda')).toHaveCount(1);
  await page.evaluate(() => console.log('csp-probe-123'));
  await page.locator('.eruda-entry-btn').click();
  await expect(page.getByText('csp-probe-123')).toBeVisible();
  expect((await violations(page)).filter((v) => !ERUDA_ALLOWED.includes(v))).toEqual([]);
});

test('CSP 確實生效：inline script 會被擋', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = 'window.__inline = 1';
    document.head.appendChild(s);
  });
  expect(await page.evaluate(() => (window as unknown as { __inline?: number }).__inline)).toBeUndefined();
  expect((await violations(page)).some((v) => v.startsWith('script-src'))).toBe(true);
});
