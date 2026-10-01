import { describe, expect, it } from 'vitest';
import {
  elementBounds,
  eraseStroke,
  lassoHit,
  pointInPolygon,
  strokeHit,
  transformElement,
  unionBounds,
} from '../src/editor/geometry';
import type { ImageElement, StrokeElement, TextElement } from '../src/db/schema';

/** 水平線 y = 50，x 從 0 到 100，每 step 一點 */
const line = (step = 10) => {
  const a: number[] = [];
  for (let x = 0; x <= 100; x += step) a.push(x, 50, 0.5);
  return new Float32Array(a);
};

const xs = (p: Float32Array) => [...p].filter((_, i) => i % 3 === 0);

const stroke = (points: Float32Array, width = 2): StrokeElement => ({
  id: 's', pageId: 'p', z: 0, type: 'stroke', tool: 'pen', color: '#000', width, points,
});

describe('eraseStroke（局部擦除）', () => {
  it('沒碰到時回傳 null', () => {
    expect(eraseStroke(line(), 50, 80, 5)).toBeNull();
  });

  it('從中間擦過：切成兩段，切點在圓的邊界', () => {
    const pieces = eraseStroke(line(), 50, 50, 5)!;
    expect(pieces).toHaveLength(2);
    expect(xs(pieces[0])[0]).toBe(0);
    expect(xs(pieces[0]).at(-1)).toBeCloseTo(45);
    expect(xs(pieces[1])[0]).toBeCloseTo(55);
    expect(xs(pieces[1]).at(-1)).toBe(100);
  });

  it('點很稀疏時，圓落在兩點之間也會切斷', () => {
    const sparse = new Float32Array([0, 50, 0.5, 100, 50, 0.5]);
    const pieces = eraseStroke(sparse, 50, 50, 5)!;
    expect(pieces.map((p) => xs(p).map(Math.round))).toEqual([
      [0, 45],
      [55, 100],
    ]);
  });

  it('擦掉開頭：只剩一段', () => {
    const pieces = eraseStroke(line(), 0, 50, 15)!;
    expect(pieces).toHaveLength(1);
    expect(xs(pieces[0])[0]).toBeCloseTo(15);
    expect(xs(pieces[0]).at(-1)).toBe(100);
  });

  it('整筆在圓內：回傳空陣列', () => {
    expect(eraseStroke(line(), 50, 50, 80)).toEqual([]);
  });

  it('單點（點一下）', () => {
    const dot = new Float32Array([10, 10, 0.5]);
    expect(eraseStroke(dot, 12, 10, 5)).toEqual([]);
    expect(eraseStroke(dot, 30, 10, 5)).toBeNull();
  });

  it('pressure 依切點內插', () => {
    const p = new Float32Array([0, 0, 0, 100, 0, 1]);
    const [first] = eraseStroke(p, 100, 0, 50)!;
    expect(first[5]).toBeCloseTo(0.5);
  });
});

describe('strokeHit（整筆擦除）', () => {
  it('稀疏線段的中間也算碰到', () => {
    const sparse = new Float32Array([0, 50, 0.5, 100, 50, 0.5]);
    expect(strokeHit(sparse, 50, 52, 3)).toBe(true);
    expect(strokeHit(sparse, 50, 60, 3)).toBe(false);
  });
});

describe('套索', () => {
  const square = [0, 0, 100, 0, 100, 100, 0, 100];

  it('pointInPolygon', () => {
    expect(pointInPolygon(50, 50, square)).toBe(true);
    expect(pointInPolygon(150, 50, square)).toBe(false);
  });

  it('stroke 超過 50% 的點在範圍內才算選中', () => {
    // 11 點中 6 點在範圍內（x = 45..95）
    const half = stroke(new Float32Array([...line()].map((v, i) => (i % 3 === 0 ? v + 45 : v))));
    expect(lassoHit(half, square)).toBe(true);
    // 11 點中 5 點在範圍內（x = 55..95）
    const less = stroke(new Float32Array([...line()].map((v, i) => (i % 3 === 0 ? v + 55 : v))));
    expect(lassoHit(less, square)).toBe(false);
  });

  it('圖片看中心點', () => {
    const img: ImageElement = { id: 'i', pageId: 'p', z: 0, type: 'image', blobId: 'b', x: 60, y: 60, w: 30, h: 30, rotation: 0 };
    expect(lassoHit(img, square)).toBe(true);
    expect(lassoHit({ ...img, x: 90 }, square)).toBe(false);
  });
});

describe('外框與變形', () => {
  it('stroke 外框包含線寬', () => {
    expect(elementBounds(stroke(line(), 4))).toEqual({ x: -2, y: 48, w: 104, h: 4 });
  });

  it('文字外框高度依行數估算', () => {
    const t: TextElement = { id: 't', pageId: 'p', z: 0, type: 'text', x: 10, y: 20, w: 100, content: 'a\nb', fontSize: 10, color: '#000' };
    expect(elementBounds(t).h).toBeCloseTo(28);
  });

  it('unionBounds', () => {
    expect(unionBounds([])).toBeNull();
    expect(unionBounds([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: -5, w: 5, h: 5 }])).toEqual({ x: 0, y: -5, w: 25, h: 15 });
  });

  it('縮放 stroke：點與線寬一起縮放，不改動原本的陣列', () => {
    const s = stroke(new Float32Array([10, 10, 0.5, 20, 30, 0.7]), 2);
    const t = transformElement(s, { s: 2, ox: 10, oy: 10, dx: 5, dy: 0 });
    expect([...t.points]).toEqual([15, 10, 0.5, 35, 50, expect.closeTo(0.7)]);
    expect(t.width).toBe(4);
    expect(s.points[3]).toBe(20);
  });

  it('縮放圖片與文字', () => {
    const img: ImageElement = { id: 'i', pageId: 'p', z: 0, type: 'image', blobId: 'b', x: 10, y: 10, w: 30, h: 20, rotation: 0 };
    expect(transformElement(img, { s: 0.5, ox: 0, oy: 0, dx: 1, dy: 1 })).toMatchObject({ x: 6, y: 6, w: 15, h: 10 });
    const t: TextElement = { id: 't', pageId: 'p', z: 0, type: 'text', x: 0, y: 0, w: 100, content: 'a', fontSize: 16, color: '#000' };
    expect(transformElement(t, { s: 1.5, ox: 0, oy: 0, dx: 0, dy: 0 })).toMatchObject({ w: 150, fontSize: 24 });
  });
});
