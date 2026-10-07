import { describe, expect, it } from 'vitest';
import type { StrokeElement } from '../src/db/schema';
import { lassoHit } from '../src/editor/geometry';
import { rectPolygon } from '../src/editor/tools/lasso';

/** 水平線 y = 50，x 從 x0 開始，11 點、間距 10 */
const line = (x0: number): StrokeElement => {
  const a: number[] = [];
  for (let i = 0; i <= 10; i++) a.push(x0 + i * 10, 50, 0.5);
  return { id: 's', pageId: 'p', z: 0, type: 'stroke', tool: 'pen', color: '#000', width: 3, points: new Float32Array(a) };
};

describe('矩形套索', () => {
  it('對角兩點圍成矩形（從哪個角拖都一樣）', () => {
    expect(rectPolygon({ x: 0, y: 0, pressure: 0 }, { x: 100, y: 80, pressure: 0 })).toEqual([0, 0, 100, 0, 100, 80, 0, 80]);
    const reversed = rectPolygon({ x: 100, y: 80, pressure: 0 }, { x: 0, y: 0, pressure: 0 });
    expect(lassoHit(line(0), reversed)).toBe(true);
  });

  it('與自由套索相同的規則：超過 50% 的點在矩形內才算選中', () => {
    const rect = rectPolygon({ x: 0, y: 0, pressure: 0 }, { x: 100, y: 100, pressure: 0 });
    expect(lassoHit(line(45), rect)).toBe(true); // 6／11 點在內
    expect(lassoHit(line(55), rect)).toBe(false); // 5／11 點在內
  });
});
