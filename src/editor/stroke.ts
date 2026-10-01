import { getStroke } from 'perfect-freehand';
import type { PageElement, StrokeElement } from '../db/schema';

export const HIGHLIGHTER_ALPHA = 0.5;

/** 固定線寬的輪廓（M-1 決策：不做壓感，忽略 pressure） */
export function strokeOutline(points: Float32Array, width: number): number[][] {
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < points.length; i += 3) pts.push([points[i], points[i + 1]]);
  return getStroke(pts, {
    size: width,
    thinning: 0,
    smoothing: 0.5,
    streamline: 0.35,
    simulatePressure: false,
    last: true,
  });
}

/** 輪廓轉成 SVG path（canvas 用 Path2D；M7 匯出 PDF 用 drawSvgPath） */
export function outlineToSvgPath(outline: number[][]): string {
  if (outline.length === 0) return '';
  const f = (n: number) => +n.toFixed(2);
  const [x0, y0] = outline[0];
  let d = `M${f(x0)} ${f(y0)}`;
  for (let i = 1; i < outline.length; i++) {
    const [ax, ay] = outline[i - 1];
    const [bx, by] = outline[i];
    d += `Q${f(ax)} ${f(ay)} ${f((ax + bx) / 2)} ${f((ay + by) / 2)}`;
  }
  return d + 'Z';
}

const pathCache = new WeakMap<StrokeElement, Path2D>();

function strokePath(s: StrokeElement): Path2D {
  let p = pathCache.get(s);
  if (!p) {
    p = new Path2D(outlineToSvgPath(strokeOutline(s.points, s.width)));
    pathCache.set(s, p);
  }
  return p;
}

/** 畫一筆；scale = canvas 像素 / pt */
export function drawStroke(ctx: CanvasRenderingContext2D, s: StrokeElement, scale: number): void {
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = s.color;
  if (s.tool === 'highlighter') {
    ctx.globalAlpha = HIGHLIGHTER_ALPHA;
    ctx.globalCompositeOperation = 'multiply';
  }
  ctx.fill(strokePath(s));
  ctx.restore();
}

/** 重畫整個 ink 圖層：螢光筆一律在最底層，其餘依 z 排序 */
export function renderInk(ctx: CanvasRenderingContext2D, els: PageElement[], scale: number): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
  const strokes = els.filter((e): e is StrokeElement => e.type === 'stroke');
  const rank = (s: StrokeElement) => (s.tool === 'highlighter' ? 0 : 1);
  strokes.sort((a, b) => rank(a) - rank(b) || a.z - b.z);
  for (const s of strokes) drawStroke(ctx, s, scale);
}
