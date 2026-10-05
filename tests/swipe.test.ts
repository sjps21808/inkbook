import { describe, expect, it } from 'vitest';
import { swipeStep } from '../src/editor/PageList';

describe('手指滑動翻頁判斷', () => {
  it('往左滑 = 下一頁，往右滑 = 上一頁', () => {
    expect(swipeStep(-120, 10, 200)).toBe(1);
    expect(swipeStep(120, -10, 200)).toBe(-1);
  });

  it('距離太短不算', () => {
    expect(swipeStep(-49, 0, 100)).toBe(0);
  });

  it('偏垂直方向不算', () => {
    expect(swipeStep(-100, 80, 200)).toBe(0);
  });

  it('太慢（超過 800ms）不算', () => {
    expect(swipeStep(-300, 0, 900)).toBe(0);
  });
});
