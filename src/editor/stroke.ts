import type { ImageElement, PageElement, StrokeElement } from '../db/schema';

export const HIGHLIGHTER_ALPHA = 0.5;

/** 距離上一個保留點不到這麼多 pt 的點丟掉（去掉太密的點與往回跳的抖動） */
const MIN_STEP = 1;

/**
 * 筆畫的中心線（畫面、書寫中的預覽與匯出 PDF 共用；2026-10-10 決策：固定線寬描線，不用輪廓填色）。
 * 先丟掉離上一個保留點不到 MIN_STEP 的點，再做一次前後點 1:2:1 加權平均：
 * 對稱的平均不會落後筆尖，急轉彎的轉角保持完整（不像追著筆尖的平滑會切掉轉角）。
 * 起點與終點不動，線頭線尾停在下筆與放開的地方。忽略 pressure
 */
export function strokeCenterline(points: Float32Array): [number, number][] {
  const n = Math.floor(points.length / 3);
  if (n === 0) return [];
  const kept: [number, number][] = [[points[0], points[1]]];
  for (let i = 1; i < n; i++) {
    const [x, y] = [points[i * 3], points[i * 3 + 1]];
    const [lx, ly] = kept[kept.length - 1];
    if (Math.hypot(x - lx, y - ly) >= MIN_STEP) kept.push([x, y]);
  }
  const [ex, ey] = [points[(n - 1) * 3], points[(n - 1) * 3 + 1]];
  const [lx, ly] = kept[kept.length - 1];
  if (n > 1 && (lx !== ex || ly !== ey)) kept.push([ex, ey]);
  return kept.map((p, i) => {
    if (i === 0 || i === kept.length - 1) return p;
    const [a, b] = [kept[i - 1], kept[i + 1]];
    return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4];
  });
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

/** 畫一筆（書寫中的預覽也用這個，放開時不會跳）：中心線以固定線寬描線，線帽、轉角都是圓的；scale = canvas 像素 / pt */
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
