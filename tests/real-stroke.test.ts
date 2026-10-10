import { describe, expect, it } from 'vitest';
import { strokeCenterline } from '../src/editor/stroke';
import dump from './fixtures/real-stroke-bumps.json';

/** 往回折的位置（中心線上的 index）：相鄰兩段方向的夾角超過 120 度 */
const reversalsAt = (c: [number, number][]) => {
  const at: number[] = [];
  for (let i = 1; i < c.length - 1; i++) {
    const [ax, ay] = [c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]];
    const [bx, by] = [c[i + 1][0] - c[i][0], c[i + 1][1] - c[i][1]];
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    if (la && lb && (ax * bx + ay * by) / (la * lb) < -0.5) at.push(i);
  }
  return at;
};
const reversals = (c: [number, number][]) => reversalsAt(c).length;

describe('iPad 實際筆跡（Safari 重送合併事件，2026-10-11 使用者匯出）', () => {
  it('原始點裡確實有重送：每批 4 點各出現兩次', () => {
    const p = dump.points;
    // 第 40～43 點和 44～47 點完全一樣
    expect(p.slice(40 * 3, 44 * 3)).toEqual(p.slice(44 * 3, 48 * 3));
  });

  it('中心線去掉重送的點：除了下筆時真的小勾，不會往回折（轉彎處不會禿出來）', () => {
    const c = strokeCenterline(new Float32Array(dump.points));
    // 原始點 0～25 往下、26～27 往上：下筆時真的畫了一個小勾，在中心線開頭；修好前另外還有 14 處重送造成的往回折
    const at = reversalsAt(c);
    expect(at.length).toBeLessThanOrEqual(1);
    for (const i of at) expect(i).toBeLessThan(12);
  });

  it('沒有重送的點時不受影響（停在原地的重複點本來就會被丟掉）', () => {
    const a: number[] = [];
    for (let x = 0; x <= 50; x += 2) a.push(x, 10, 0.5, x, 10, 0.5); // 每點重複一次（停住）
    const c = strokeCenterline(new Float32Array(a));
    expect(c[0]).toEqual([0, 10]);
    expect(c[c.length - 1]).toEqual([50, 10]);
    expect(reversals(c)).toBe(0);
  });
});
