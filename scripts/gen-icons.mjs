// 由 scripts/icon.svg 產生 PNG 圖示：node scripts/gen-icons.mjs
import { readFileSync } from 'node:fs';
import { webkit } from '@playwright/test';

const svg = readFileSync(new URL('./icon.svg', import.meta.url), 'utf8');
const outputs = [
  ['public/icons/icon-192.png', 192],
  ['public/icons/icon-512.png', 512],
  ['public/icons/apple-touch-icon.png', 180],
];

const browser = await webkit.launch();
for (const [path, size] of outputs) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(
    `<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  await page.screenshot({ path, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
}
await browser.close();
