import { test } from '@playwright/test';
import { openNewNotebook } from '../helpers/pen';
const dir = 'C:/Users/user/AppData/Local/Temp/claude/D--goodnote/374bd943-f0bc-46fe-8f86-e2f8f62144d6/scratchpad/';
test('noisy', async ({ page }) => {
  await openNewNotebook(page, 'x', false);
  await page.evaluate(() => {
    const pageEl = document.querySelector('.page[data-index="0"]')!;
    const target = pageEl.querySelector('.overlay')!;
    const r = pageEl.getBoundingClientRect();
    const k = r.width / 595; // px / pt
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
    const pts: [number, number][] = [];
    // A4 座標的螺旋；點距約 1pt（240Hz、中速），抖動 ±0.3pt
    let t = 0;
    while (t < Math.PI * 8) {
      const rad = 60 + t * 9;
      pts.push([297 + rad * Math.cos(t) + rnd() * 0.6, 421 + rad * 1.4 * Math.sin(t) + rnd() * 0.6]);
      t += 1 / rad;
    }
    const fire = (type: string, [x, y]: [number, number]) =>
      target.dispatchEvent(new PointerEvent(type, { pointerType: 'pen', pointerId: 7, isPrimary: true, pressure: 0.5, clientX: r.left + x * k, clientY: r.top + y * k, bubbles: true, cancelable: true }));
    fire('pointerdown', pts[0]);
    for (const p of pts.slice(1)) fire('pointermove', p);
    fire('pointerup', pts[pts.length - 1]);
  });
  await page.waitForTimeout(800);
  await page.locator('.page[data-index="0"]').screenshot({ path: dir + 'noisy.png' });
});
