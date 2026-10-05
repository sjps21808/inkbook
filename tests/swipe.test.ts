import { describe, expect, it } from 'vitest';
import { swipeStep } from '../src/editor/PageList';

describe('手指滑動翻頁判斷', () => {
  it('往左滑 = 下一頁，往右滑 = 上一頁', () => {
    expect(swipeStep(-120, 10, 200)).toBe(1);
    expect(swipeStep(120, -10, 200)).toBe(-1);
  });

  it('快速輕撥：15px 以上且速度 ≥ 0.3px/ms 就算', () => {
    expect(swipeStep(-30, 0, 100)).toBe(1);
    expect(swipeStep(15, 0, 50)).toBe(-1);
    expect(swipeStep(-14, 0, 10)).toBe(0);
    expect(swipeStep(-30, 0, 200)).toBe(0); // 0.15px/ms 太慢、距離也不到 40px
  });

  it('慢慢拖：40px 以上就算，不限時間', () => {
    expect(swipeStep(-40, 0, 3000)).toBe(1);
    expect(swipeStep(-39, 0, 3000)).toBe(0);
  });

  it('偏垂直方向不算（水平量要大於垂直量）', () => {
    expect(swipeStep(-100, 100, 200)).toBe(0);
    expect(swipeStep(-100, 90, 200)).toBe(1);
  });
});
