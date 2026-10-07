import { describe, expect, it } from 'vitest';
import { clampPan } from '../src/editor/PageList';

describe('白紙平移限制', () => {
  // 看得到的範圍 [16, 816]（寬 800）
  it('白紙比範圍大：左右邊緣不能被拖進範圍內', () => {
    expect(clampPan(100, 1600, 16, 816)).toBe(16); // 左邊緣露出來 → 拉回
    expect(clampPan(-2000, 1600, 16, 816)).toBe(816 - 1600); // 右邊緣露出來 → 拉回
    expect(clampPan(-300, 1600, 16, 816)).toBe(-300); // 範圍內不動
  });

  it('白紙比範圍小：整張留在範圍內', () => {
    expect(clampPan(0, 500, 16, 816)).toBe(16);
    expect(clampPan(600, 500, 16, 816)).toBe(316);
    expect(clampPan(100, 500, 16, 816)).toBe(100);
  });

  it('剛好等於範圍（1x）：不動', () => {
    expect(clampPan(16, 800, 16, 816)).toBe(16);
  });
});
