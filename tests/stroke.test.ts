import { beforeAll, describe, expect, it } from 'vitest';
import { centerlineToSvgPath, renderInk, strokeCenterline } from '../src/editor/stroke';
import type { PageElement, StrokeElement } from '../src/db/schema';

const line = (pressure: number) => {
  const a: number[] = [];
  for (let x = 0; x <= 100; x += 5) a.push(x, 50, pressure);
  return new Float32Array(a);
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
    // 抖動大小用標準差衡量（最大起伏只看最極端的一點，太不穩定）
    const std = (ys: number[]) => {
      const m = ys.reduce((a, b) => a + b, 0) / ys.length;
      return Math.sqrt(ys.reduce((a, y) => a + (y - m) ** 2, 0) / ys.length);
    };
    const rawYs = [...raw].filter((_, i) => i % 3 === 1);
    expect(std(c.slice(5, -5).map((p) => p[1]))).toBeLessThan(std(rawYs) * 0.75);
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

describe('centerlineToSvgPath', () => {
  it('二次曲線通過各段中點，最後連到終點；不到兩點時是空字串', () => {
    expect(
      centerlineToSvgPath([
        [0, 0],
        [10, 0],
        [10, 10],
      ]),
    ).toBe('M0 0Q10 0 10 5L10 10');
    expect(
      centerlineToSvgPath([
        [0, 0],
        [4, 0],
      ]),
    ).toBe('M0 0L4 0');
    expect(centerlineToSvgPath([[1, 1]])).toBe('');
    expect(centerlineToSvgPath([])).toBe('');
  });
});

describe('中心線的轉角', () => {
  it('急轉彎（90 度）的轉角保持完整：平滑後的頂點離原本的轉角不到 0.6pt，也不會落後筆尖', () => {
    // 往右 30pt、再往下 30pt；點距 1.5pt
    const a: number[] = [];
    for (let x = 0; x <= 30; x += 1.5) a.push(x, 0, 0.5);
    for (let y = 1.5; y <= 30; y += 1.5) a.push(30, y, 0.5);
    const c = strokeCenterline(new Float32Array(a));
    const nearest = Math.min(...c.map(([x, y]) => Math.hypot(x - 30, y)));
    expect(nearest).toBeLessThan(0.6);
    // 直線段上的點不偏離（沒有落後造成的位移）
    for (const [x, y] of c) if (x < 27) expect(Math.abs(y)).toBeLessThan(1e-9);
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

  it('點一下（只有一點）：畫成直徑等於線寬的圓點', () => {
    const calls: string[] = [];
    const fake = {
      canvas: { width: 100, height: 100 },
      fillStyle: '',
      save() {},
      restore() {},
      setTransform() {},
      clearRect() {},
      beginPath() {},
      arc: (x: number, y: number, r: number) => calls.push(`arc ${x} ${y} ${r}`),
      fill: () => calls.push(`fill ${fake.fillStyle}`),
      stroke: () => calls.push('stroke'),
    };
    const dot: StrokeElement = {
      id: 'd', pageId: 'p', z: 0, type: 'stroke', tool: 'pen', color: 'blue', width: 4,
      points: new Float32Array([10, 20, 0.5]),
    };
    renderInk(fake as unknown as CanvasRenderingContext2D, [dot], 1);
    expect(calls).toEqual(['arc 10 20 2', 'fill blue']);
  });
});
