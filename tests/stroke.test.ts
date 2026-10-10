import { beforeAll, describe, expect, it } from 'vitest';
import {
  centerlineToSvgPath,
  drawLiveStroke,
  outlineToSvgPath,
  renderInk,
  strokeCenterline,
  strokeOutline,
} from '../src/editor/stroke';
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

describe('strokeCenterline', () => {
  /** 帶抖動的密集水平線（點距 0.8pt、抖動 ±0.3pt） */
  const noisy = (seed: number) => {
    const a: number[] = [];
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647 - 0.5;
    };
    for (let x = 0; x <= 400; x += 0.8) a.push(x + rnd() * 0.6, 100 + rnd() * 0.6, 0.5);
    return new Float32Array(a);
  };

  it('不受 pressure 影響', () => {
    expect(strokeCenterline(line(0.1))).toEqual(strokeCenterline(line(1)));
  });

  it('去掉抖動：不會往回跳，上下起伏明顯比原始點小，相鄰點至少相距 1pt', () => {
    const raw = noisy(7);
    const c = strokeCenterline(raw);
    for (let i = 1; i < c.length; i++) {
      expect(c[i][0]).toBeGreaterThan(c[i - 1][0]); // 一路往右
      if (i < c.length - 1) expect(Math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1])).toBeGreaterThanOrEqual(1);
    }
    const range = (ys: number[]) => Math.max(...ys) - Math.min(...ys);
    const rawYs = [...raw].filter((_, i) => i % 3 === 1);
    expect(range(c.slice(5, -5).map((p) => p[1]))).toBeLessThan(range(rawYs) * 0.85);
  });

  it('起點與終點留在原位（線頭線尾停在下筆與放開的地方）', () => {
    const p = noisy(3);
    const c = strokeCenterline(p);
    expect(c[0]).toEqual([p[0], p[1]]);
    expect(c[c.length - 1]).toEqual([p[p.length - 3], p[p.length - 2]]);
  });

  it('點一下（只有一點）：中心線只有一點、沒有 path（畫成圓點）', () => {
    const c = strokeCenterline(new Float32Array([10, 10, 0.5]));
    expect(c).toEqual([[10, 10]]);
    expect(centerlineToSvgPath(c)).toBe('');
  });

  it('畫太快（點很稀疏）也連成一條：path 從起點到終點', () => {
    const a: number[] = [];
    for (let t = 0; t <= Math.PI; t += 0.3) a.push(200 + 60 * Math.cos(t), 200 + 120 * Math.sin(t), 0.5);
    const c = strokeCenterline(new Float32Array(a));
    const d = centerlineToSvgPath(c);
    expect(d.startsWith(`M${c[0][0]} ${c[0][1]}`)).toBe(true);
    expect(d).toMatch(/L[-\d.]+ [-\d.]+$/);
    expect(c.length).toBeGreaterThan(5);
  });
});

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

describe('drawLiveStroke', () => {
  const fakeCtx = () => {
    const calls: string[] = [];
    const ctx = {
      save() {},
      restore() {},
      setTransform() {},
      beginPath() {},
      moveTo: () => calls.push('moveTo'),
      lineTo: () => calls.push('lineTo'),
      arc: () => calls.push('arc'),
      stroke: () => calls.push('stroke'),
      fill: () => calls.push('fill'),
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
  };
  const stroke = (points: number[]): StrokeElement => ({
    id: '',
    pageId: '',
    z: 0,
    type: 'stroke',
    tool: 'pen',
    color: '#000',
    width: 3,
    points: new Float32Array(points),
  });

  it('直接用原始點畫一條折線（每個點一次 lineTo、只 stroke 一次），不算輪廓', () => {
    const { ctx, calls } = fakeCtx();
    drawLiveStroke(ctx, stroke(Array.from(line(0.5))), 2);
    expect(calls).toEqual(['moveTo', ...Array(20).fill('lineTo'), 'stroke']);
  });

  it('單點畫成圓點', () => {
    const { ctx, calls } = fakeCtx();
    drawLiveStroke(ctx, stroke([10, 10, 0.5]), 2);
    expect(calls).toEqual(['arc', 'fill']);
  });
});

describe('renderInk', () => {
  beforeAll(() => {
    // jsdom 沒有 Path2D
    (globalThis as { Path2D?: unknown }).Path2D ??= class {
      constructor(public d: string) {}
    };
  });

  it('螢光筆先畫（最底層、multiply），筆依 z 排序在上；每一筆都是固定線寬、圓頭圓角的描線', () => {
    const calls: string[] = [];
    const fake = {
      canvas: { width: 100, height: 100 },
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      save() {},
      restore() {
        fake.globalAlpha = 1;
        fake.globalCompositeOperation = 'source-over';
      },
      setTransform() {},
      clearRect: () => calls.push('clear'),
      stroke: () =>
        calls.push(
          `${fake.strokeStyle} ${fake.globalCompositeOperation} ${fake.globalAlpha} w=${fake.lineWidth} ${fake.lineCap}/${fake.lineJoin}`,
        ),
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
    expect(calls).toEqual([
      'clear',
      'yellow multiply 0.5 w=3 round/round',
      'black source-over 1 w=3 round/round',
      'red source-over 1 w=3 round/round',
    ]);
  });
});
