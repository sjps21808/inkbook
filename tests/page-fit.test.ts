import { describe, expect, it } from 'vitest';
import { PAGE_HEIGHT, PAGE_WIDTH } from '../src/db/schema';
import { fitPageWidth } from '../src/editor/PageList';

const heightOf = (w: number) => (w * PAGE_HEIGHT) / PAGE_WIDTH;

describe('頁面大小', () => {
  it('直向：寬度受容器限制，整頁仍在螢幕內', () => {
    const w = fitPageWidth(788, 1180, 0);
    expect(w).toBe(788);
    expect(heightOf(w)).toBeLessThanOrEqual(1180 - 32);
  });

  it('橫向：寬度縮到整頁放得進螢幕高度', () => {
    const w = fitPageWidth(1148, 820, 0);
    expect(heightOf(w)).toBeCloseTo(820 - 32);
    expect(w).toBeLessThan(1148);
  });

  it('扣掉頂端固定區域（含狀態列）', () => {
    expect(heightOf(fitPageWidth(1148, 820, 24))).toBeCloseTo(820 - 24 - 32);
  });

  it('不超過上限 900', () => {
    expect(fitPageWidth(2000, 3000, 0)).toBe(900);
  });

  it('尚未量到尺寸時是 0', () => {
    expect(fitPageWidth(0, 0, 0)).toBe(0);
    expect(fitPageWidth(800, 0, 0)).toBe(0);
  });
});
