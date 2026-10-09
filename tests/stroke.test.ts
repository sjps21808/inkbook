import { beforeAll, describe, expect, it } from 'vitest';
import { outlineToSvgPath, renderInk, strokeOutline } from '../src/editor/stroke';
import type { PageElement, StrokeElement } from '../src/db/schema';

const line = (pressure: number) => {
  const a: number[] = [];
  for (let x = 0; x <= 100; x += 5) a.push(x, 50, pressure);
  return new Float32Array(a);
};

const bbox = (o: number[][]) => {
  const ys = o.map((p) => p[1]);
  return Math.max(...ys) - Math.min(...ys);
};

describe('strokeOutline', () => {
  it('線寬固定，不受 pressure 影響', () => {
    expect(strokeOutline(line(0.1), 6)).toEqual(strokeOutline(line(1), 6));
  });

  it('水平線的輪廓高度約等於線寬', () => {
    expect(bbox(strokeOutline(line(0.5), 6))).toBeCloseTo(6, 0);
    expect(bbox(strokeOutline(line(0.5), 14))).toBeCloseTo(14, 0);
  });

  it('單點（點一下）也有輪廓', () => {
    expect(strokeOutline(new Float32Array([10, 10, 0.5]), 4).length).toBeGreaterThan(0);
  });

  it('畫太快（點很稀疏）時輪廓不會有反折的缺口', () => {
    // 稀疏的弧線：相鄰兩點相距約 20pt
    const a: number[] = [];
    for (let t = 0; t < Math.PI * 1.5; t += 0.2) a.push(200 + 60 * Math.cos(t), 200 + 120 * Math.sin(t), 0.5);
    const width = 5;
    const o = strokeOutline(new Float32Array(a), width);
    // nonzero 填色：輸入折線上（含兩側 0.3 線寬）每一點的 winding 都不可以是 0
    const wind = (x: number, y: number) => {
      let w = 0;
      for (let i = 0; i < o.length; i++) {
        const [ax, ay] = o[i];
        const [bx, by] = o[(i + 1) % o.length];
        const cross = (bx - ax) * (y - ay) - (x - ax) * (by - ay);
        if (ay <= y) {
          if (by > y && cross > 0) w++;
        } else if (by <= y && cross < 0) w--;
      }
      return w;
    };
    let holes = 0;
    for (let i = 6; i + 5 < a.length - 6; i += 3) {
      const [ax, ay, bx, by] = [a[i], a[i + 1], a[i + 3], a[i + 4]];
      const len = Math.hypot(bx - ax, by - ay);
      const [nx, ny] = [-(by - ay) / len, (bx - ax) / len];
      for (let k = 0; k <= 20; k++) {
        const [x, y] = [ax + ((bx - ax) * k) / 20, ay + ((by - ay) * k) / 20];
        for (const r of [-0.3, 0, 0.3]) if (wind(x + nx * r * width, y + ny * r * width) === 0) holes++;
      }
    }
    expect(holes).toBe(0);
  });
});

describe('outlineToSvgPath', () => {
  it('產生封閉的 path', () => {
    const d = outlineToSvgPath([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
    expect(d).toBe('M0 0Q0 0 5 0Q10 0 10 5Z');
    expect(outlineToSvgPath([])).toBe('');
  });
});

describe('renderInk', () => {
  beforeAll(() => {
    // jsdom 沒有 Path2D
    (globalThis as { Path2D?: unknown }).Path2D ??= class {
      constructor(public d: string) {}
    };
  });

  it('螢光筆先畫（最底層、multiply），筆依 z 排序在上', () => {
    const calls: string[] = [];
    const fake = {
      canvas: { width: 100, height: 100 },
      fillStyle: '',
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      save() {},
      restore() {
        fake.globalAlpha = 1;
        fake.globalCompositeOperation = 'source-over';
      },
      setTransform() {},
      clearRect: () => calls.push('clear'),
      fill: () => calls.push(`${fake.fillStyle} ${fake.globalCompositeOperation} ${fake.globalAlpha}`),
    };
    const ctx = fake as unknown as CanvasRenderingContext2D;

    const mk = (id: string, tool: 'pen' | 'highlighter', z: number, color: string): StrokeElement => ({
      id, pageId: 'p', z, type: 'stroke', tool, color, width: 3, points: line(0.5),
    });
    const els: PageElement[] = [
      mk('p2', 'pen', 3, 'red'),
      mk('h1', 'highlighter', 4, 'yellow'),
      mk('p1', 'pen', 1, 'black'),
    ];
    renderInk(ctx, els, 2);
    expect(calls).toEqual(['clear', 'yellow multiply 0.5', 'black source-over 1', 'red source-over 1']);
  });
});
