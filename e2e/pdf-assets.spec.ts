import { expect, test } from '@playwright/test';

const ASSETS = [
  'pdf.worker.min.mjs',
  'pdfjs/cmaps/UniCNS-UCS2-H.bcmap',
  'pdfjs/cmaps/Adobe-CNS1-UCS2.bcmap',
  'pdfjs/standard_fonts/FoxitSerif.pfb',
  'pdfjs/standard_fonts/LiberationSans-Regular.ttf',
  'pdfjs/wasm/openjpeg.wasm',
  'pdfjs/wasm/jbig2.wasm',
  'pdfjs/wasm/qcms_bg.wasm',
];

test('pdf.js 的 worker、cMap、標準字型、wasm 都有輸出並預先快取', async ({ page }) => {
  const sw = await (await page.request.get('sw.js')).text();
  const urls = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]);
  expect(urls).toEqual(expect.arrayContaining(ASSETS));
  // PDF 內嵌 JS 用的 quickjs 不需要
  expect(urls.some((u) => u.includes('quickjs'))).toBe(false);
  for (const a of ASSETS) expect((await page.request.get(a)).ok(), a).toBe(true);
});

test('CSP 允許 wasm 編譯，但仍禁止 eval', async ({ page }) => {
  await page.goto('./');
  const content = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(content).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(content).not.toContain("'unsafe-eval'");
});
