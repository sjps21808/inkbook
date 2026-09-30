import { expect, test } from '@playwright/test';

const icons: [string, number][] = [
  ['icons/icon-192.png', 192],
  ['icons/icon-512.png', 512],
  ['icons/apple-touch-icon.png', 180],
];

for (const [path, size] of icons) {
  test(`圖示 ${path} 是 ${size}×${size}`, async ({ page }) => {
    await page.goto('./');
    const dims = await page.evaluate(async (p) => {
      const blob = await (await fetch(p)).blob();
      const bmp = await createImageBitmap(blob);
      return [bmp.width, bmp.height, blob.type];
    }, path);
    expect(dims).toEqual([size, size, 'image/png']);
  });
}
