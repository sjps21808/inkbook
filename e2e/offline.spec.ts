import { expect, test } from '@playwright/test';

// 限制：Playwright WebKit（Windows）的 setOffline／route 會在 SW 之前攔下導覽，或完全繞過 SW，
// 無法在這裡模擬離線導覽（交給 iPad 飛航模式實測）。
// 這裡驗證：頁面受 SW 控制，且預先快取清單中的每個資源都已存進 Cache Storage。
test.use({ serviceWorkers: 'allow' });

test('預先快取的資源全部存進 Cache Storage', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (reg.active?.state !== 'activated') {
      await new Promise<void>((resolve) =>
        reg.active!.addEventListener('statechange', () => reg.active!.state === 'activated' && resolve()),
      );
    }
  });
  // 第一次載入時頁面還不受 SW 控制，重新載入一次
  await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  const sw = await (await page.request.get('sw.js')).text();
  const urls = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]);
  expect(urls).toEqual(
    expect.arrayContaining(['index.html', 'fonts/NotoSansTC-Regular.ttf', 'pdf.worker.min.mjs']),
  );

  const sizes = await page.evaluate(
    (paths) =>
      Promise.all(
        paths.map(async (p) => {
          const res = await caches.match(new URL(p, location.href).href, { ignoreSearch: true });
          return [p, res ? (await res.arrayBuffer()).byteLength : -1] as const;
        }),
      ),
    [...urls, 'not-precached-xyz.txt'],
  );
  const cached = Object.fromEntries(sizes);
  // 反向檢查：不在清單中的網址不應出現在快取
  expect(cached['not-precached-xyz.txt']).toBe(-1);
  for (const u of urls) expect(cached[u], u).toBeGreaterThan(0);
  // 字型要是完整的（數 MB），不是被裁切的子集
  expect(cached['fonts/NotoSansTC-Regular.ttf']).toBeGreaterThan(5_000_000);
});
