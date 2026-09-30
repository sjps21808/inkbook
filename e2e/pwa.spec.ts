import { expect, test } from '@playwright/test';

test('manifest 欄位正確', async ({ page }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('/inkbook/manifest.webmanifest');
  const m = await (await page.request.get(href!)).json();
  expect(m).toMatchObject({
    id: '/inkbook/',
    scope: '/inkbook/',
    start_url: '/inkbook/',
    display: 'standalone',
    lang: 'zh-Hant',
  });
  expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(['192x192', '512x512']);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    'href',
    '/inkbook/icons/apple-touch-icon.png',
  );
});

test('service worker 預先快取字型與 pdf.js worker', async ({ page }) => {
  const sw = await (await page.request.get('sw.js')).text();
  const urls = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]);
  expect(urls).toContain('fonts/NotoSansTC-Regular.ttf');
  expect(urls).toContain('pdf.worker.min.mjs');
  expect(urls).toContain('index.html');
  expect(new Set(urls).size).toBe(urls.length);
  const worker = await page.request.get('pdf.worker.min.mjs');
  expect(worker.ok()).toBe(true);
});
