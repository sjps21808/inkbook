import { getStroke } from 'perfect-freehand';
import type { ImageElement, PageElement, StrokeElement } from '../db/schema';

export const HIGHLIGHTER_ALPHA = 0.5;

/** 算輪廓前把相鄰點補到最多相距這麼多 pt：畫太快時點很稀疏，彎處輪廓內側會反折，填色後變成白色缺口 */
const MAX_GAP = 0.5;

/** 固定線寬的輪廓（M-1 決策：不做壓感，忽略 pressure） */
export function strokeOutline(points: Float32Array, width: number): number[][] {
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < points.length; i += 3) {
    const [x, y] = [points[i], points[i + 1]];
    if (i > 0) {
      const [px, py] = [points[i - 3], points[i - 2]];
      const n = Math.ceil(Math.hypot(x - px, y - py) / MAX_GAP);
      for (let k = 1; k < n; k++) pts.push([px + ((x - px) * k) / n, py + ((y - py) * k) / n]);
    }
    pts.push([x, y]);
  }
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

/**
 * 書寫中的即時預覽：直接用原始點畫一條圓頭折線（canvas 原生 stroke），不算 perfect-freehand 輪廓。
 * 每個 frame 重算整筆輪廓會隨筆畫變長越來越慢，快速書寫時筆跡跟不上筆尖；放開後才用 drawStroke 畫正式的一筆。
 */
export function drawLiveStroke(ctx: CanvasRenderingContext2D, s: StrokeElement, scale: number): void {
  const p = s.points;
  if (p.length < 3) return;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (s.tool === 'highlighter') {
    ctx.globalAlpha = HIGHLIGHTER_ALPHA;
    ctx.globalCompositeOperation = 'multiply';
  }
  ctx.beginPath();
  if (p.length < 6) {
    ctx.arc(p[0], p[1], s.width / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.moveTo(p[0], p[1]);
    for (let i = 3; i + 1 < p.length; i += 3) ctx.lineTo(p[i], p[i + 1]);
    ctx.stroke();
  }
  ctx.restore();
}

/** 依 blobId 取得已解碼的圖片；還沒解碼時回傳 undefined（略過不畫） */
export type ImageSource = (blobId: string) => CanvasImageSource | undefined;

/** ink 圖層的繪製順序：螢光筆一律在最底層，筆畫與圖片依 z 排序（文字不在 ink 圖層；匯出 PDF 共用） */
export function inkOrder(els: PageElement[]): (StrokeElement | ImageElement)[] {
  const drawn = els.filter((e): e is StrokeElement | ImageElement => e.type !== 'text');
  const rank = (e: StrokeElement | ImageElement) => (e.type === 'stroke' && e.tool === 'highlighter' ? 0 : 1);
  return drawn.sort((a, b) => rank(a) - rank(b) || a.z - b.z);
}

/** 重畫整個 ink 圖層（文字在 overlay） */
export function renderInk(ctx: CanvasRenderingContext2D, els: PageElement[], scale: number, image?: ImageSource): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
  for (const e of inkOrder(els)) {
    if (e.type === 'stroke') drawStroke(ctx, e, scale);
    else {
      const src = image?.(e.blobId);
      if (!src) continue;
      ctx.save();
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.drawImage(src, e.x, e.y, e.w, e.h);
      ctx.restore();
    }
  }
}
