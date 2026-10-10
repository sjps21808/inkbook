import type { ImageElement, PageElement, StrokeElement } from '../db/schema';

export const HIGHLIGHTER_ALPHA = 0.5;

/** 中心線平滑：每點往筆尖移動的比例（越小越平滑、越跟不上筆尖） */
const STREAMLINE = 0.5;
/** 平滑後的點至少相距這麼多 pt 才輸出（去掉太密的點與往回跳的抖動） */
const MIN_STEP = 1;

/**
 * 筆畫的中心線（畫面與匯出 PDF 共用；2026-10-10 決策：固定線寬描線，不用輪廓填色）。
 * 指數平滑追蹤筆尖，移動超過 MIN_STEP 才輸出一點；最後一點保留原位，線尾停在放開的地方。忽略 pressure
 */
export function strokeCenterline(points: Float32Array): [number, number][] {
  const n = Math.floor(points.length / 3);
  if (n === 0) return [];
  let [sx, sy] = [points[0], points[1]];
  const out: [number, number][] = [[sx, sy]];
  for (let i = 1; i < n; i++) {
    const [x, y] = [points[i * 3], points[i * 3 + 1]];
    sx += (x - sx) * STREAMLINE;
    sy += (y - sy) * STREAMLINE;
    const [lx, ly] = out[out.length - 1];
    if (Math.hypot(sx - lx, sy - ly) >= MIN_STEP) out.push([sx, sy]);
  }
  const [ex, ey] = [points[(n - 1) * 3], points[(n - 1) * 3 + 1]];
  const [lx, ly] = out[out.length - 1];
  if (n > 1 && (lx !== ex || ly !== ey)) out.push([ex, ey]);
  return out;
}

/** 中心線轉成 SVG path：二次曲線通過各段中點；只有一點時是空字串（畫成圓點） */
export function centerlineToSvgPath(c: [number, number][]): string {
  if (c.length < 2) return '';
  const f = (n: number) => +n.toFixed(2);
  let d = `M${f(c[0][0])} ${f(c[0][1])}`;
  for (let i = 1; i < c.length - 1; i++) {
    const [ax, ay] = c[i];
    const [bx, by] = c[i + 1];
    d += `Q${f(ax)} ${f(ay)} ${f((ax + bx) / 2)} ${f((ay + by) / 2)}`;
  }
  const [lx, ly] = c[c.length - 1];
  return d + `L${f(lx)} ${f(ly)}`;
}

/** 每一筆的中心線與 Path2D（只有一點時 path = null，畫成圓點） */
const pathCache = new WeakMap<StrokeElement, { line: [number, number][]; path: Path2D | null }>();

function strokePath(s: StrokeElement) {
  let p = pathCache.get(s);
  if (!p) {
    const line = strokeCenterline(s.points);
    const d = centerlineToSvgPath(line);
    p = { line, path: d ? new Path2D(d) : null };
    pathCache.set(s, p);
  }
  return p;
}

/** 畫一筆：中心線以固定線寬描線（線帽、轉角都是圓的）；scale = canvas 像素 / pt */
export function drawStroke(ctx: CanvasRenderingContext2D, s: StrokeElement, scale: number): void {
  const { line, path } = strokePath(s);
  if (!line.length) return;
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
  if (path) ctx.stroke(path);
  else {
    // 點一下：圓點
    ctx.beginPath();
    ctx.arc(line[0][0], line[0][1], s.width / 2, 0, Math.PI * 2);
    ctx.fill();
  }
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
