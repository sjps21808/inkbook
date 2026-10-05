import { describe, expect, it } from 'vitest';
import { addPageArmed, dragOffset, swipeStep } from '../src/editor/PageList';

describe('手指滑動翻頁判斷', () => {
  const W = 800;

  it('往左滑 = 下一頁，往右滑 = 上一頁', () => {
    expect(swipeStep(-120, 10, 200, W)).toBe(1);
    expect(swipeStep(120, -10, 200, W)).toBe(-1);
  });

  it('快速輕撥：30px 以上且速度 ≥ 0.5px/ms 就算', () => {
    expect(swipeStep(-30, 0, 60, W)).toBe(1);
    expect(swipeStep(30, 0, 60, W)).toBe(-1);
    expect(swipeStep(-29, 0, 10, W)).toBe(0); // 距離不夠
    expect(swipeStep(-60, 0, 150, W)).toBe(0); // 0.4px/ms 太慢、距離也不到 25%
  });

  it('慢慢拖：超過頁寬 25% 就算，不限時間', () => {
    expect(swipeStep(-200, 0, 3000, W)).toBe(1);
    expect(swipeStep(-199, 0, 3000, W)).toBe(0);
  });

  it('偏垂直方向不算（水平量要大於垂直量）', () => {
    expect(swipeStep(-100, 100, 100, W)).toBe(0);
    expect(swipeStep(-100, 90, 100, W)).toBe(1);
  });
});

describe('拖動跟手', () => {
  it('一般頁 1:1 跟著手指', () => {
    expect(dragOffset(-100, false, false)).toBe(-100);
    expect(dragOffset(100, false, false)).toBe(100);
  });

  it('第一頁往前、最後一頁往後只移動一半（橡皮筋）', () => {
    expect(dragOffset(100, true, false)).toBe(50);
    expect(dragOffset(-100, false, true)).toBe(-50);
    // 反方向仍然 1:1
    expect(dragOffset(-100, true, false)).toBe(-100);
    expect(dragOffset(100, false, true)).toBe(100);
  });
});

describe('最後一頁拖動新增頁面', () => {
  it('手指往左拖超過頁寬 35% 才算', () => {
    expect(addPageArmed(-280, 0, 800)).toBe(true);
    expect(addPageArmed(-279, 0, 800)).toBe(false);
  });

  it('往右或偏垂直不算', () => {
    expect(addPageArmed(200, 0, 800)).toBe(false);
    expect(addPageArmed(-200, 250, 800)).toBe(false);
  });
});
