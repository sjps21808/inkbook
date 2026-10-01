// 編輯工具的幾何運算（橡皮擦、套索、選取框）；座標單位 pt
import type { PageElement } from '../db/schema';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 文字框的行高（倍數）；DOM 顯示與外框估算共用 */
export const TEXT_LINE_HEIGHT = 1.4;

/** 局部擦除後短於這個長度的碎片直接丟掉 */
const MIN_PIECE_LENGTH = 0.5;

/** 線段 A→B 落在圓內的參數區間 [t0, t1]（0~1）；沒有交集時回傳 null */
function segmentInCircle(
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number,
): [number, number] | null {
  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - cx;
  const fy = ay - cy;
  const a = dx * dx + dy * dy;
  const c = fx * fx + fy * fy - r * r;
  if (a === 0) return c < 0 ? [0, 1] : null;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc <= 0) return null;
  const sq = Math.sqrt(disc);
  const t0 = Math.max(0, (-b - sq) / (2 * a));
  const t1 = Math.min(1, (-b + sq) / (2 * a));
  return t0 < t1 ? [t0, t1] : null;
}

function pieceLength(p: number[]): number {
  let len = 0;
  for (let i = 3; i < p.length; i += 3) len += Math.hypot(p[i] - p[i - 3], p[i + 1] - p[i - 2]);
  return len;
}

/**
 * 局部擦除：把 points（x,y,pressure 交錯）落在圓內的部分切掉。
 * 沒碰到時回傳 null；全部擦掉時回傳空陣列。
 */
export function eraseStroke(points: Float32Array, cx: number, cy: number, r: number): Float32Array[] | null {
  const n = points.length / 3;
  if (n === 1) return Math.hypot(points[0] - cx, points[1] - cy) < r ? [] : null;

  const pieces: number[][] = [];
  let cur: number[] = [];
  let touched = false;
  const at = (i: number) => [points[i * 3], points[i * 3 + 1], points[i * 3 + 2]];
  const lerp = (i: number, t: number) => {
    const a = at(i);
    const b = at(i + 1);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };
  const flush = () => {
    if (cur.length >= 6 && pieceLength(cur) >= MIN_PIECE_LENGTH) pieces.push(cur);
    cur = [];
  };

  if (Math.hypot(points[0] - cx, points[1] - cy) >= r) cur.push(...at(0));
  for (let i = 0; i < n - 1; i++) {
    const hit = segmentInCircle(
      points[i * 3], points[i * 3 + 1], points[i * 3 + 3], points[i * 3 + 4], cx, cy, r,
    );
    if (!hit) {
      cur.push(...at(i + 1));
      continue;
    }
    touched = true;
    const [t0, t1] = hit;
    if (t0 > 0) cur.push(...lerp(i, t0));
    flush();
    if (t1 < 1) cur.push(...lerp(i, t1), ...at(i + 1));
  }
  flush();
  return touched ? pieces.map((p) => Float32Array.from(p)) : null;
}

/** 整筆擦除：筆畫中心線是否碰到圓 */
export function strokeHit(points: Float32Array, cx: number, cy: number, r: number): boolean {
  const n = points.length / 3;
  if (n === 1) return Math.hypot(points[0] - cx, points[1] - cy) < r;
  for (let i = 0; i < n - 1; i++) {
    if (segmentInCircle(points[i * 3], points[i * 3 + 1], points[i * 3 + 3], points[i * 3 + 4], cx, cy, r)) {
      return true;
    }
  }
  return false;
}

/** 點是否在多邊形內（poly 為 x,y 交錯） */
export function pointInPolygon(x: number, y: number, poly: number[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i];
    const yi = poly[i + 1];
    const xj = poly[j];
    const yj = poly[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 元素的外框（文字高度依行數估算） */
export function elementBounds(el: PageElement): Rect {
  if (el.type === 'image') return { x: el.x, y: el.y, w: el.w, h: el.h };
  if (el.type === 'text') {
    const lines = Math.max(1, el.content.split('\n').length);
    return { x: el.x, y: el.y, w: el.w, h: lines * el.fontSize * TEXT_LINE_HEIGHT };
  }
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < el.points.length; i += 3) {
    x0 = Math.min(x0, el.points[i]);
    x1 = Math.max(x1, el.points[i]);
    y0 = Math.min(y0, el.points[i + 1]);
    y1 = Math.max(y1, el.points[i + 1]);
  }
  const r = el.width / 2;
  return { x: x0 - r, y: y0 - r, w: x1 - x0 + el.width, h: y1 - y0 + el.width };
}

export function unionBounds(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** 套索判定：stroke 超過 50% 的點在範圍內；圖片、文字看中心點 */
export function lassoHit(el: PageElement, poly: number[]): boolean {
  if (el.type === 'stroke') {
    const n = el.points.length / 3;
    let inside = 0;
    for (let i = 0; i < el.points.length; i += 3) {
      if (pointInPolygon(el.points[i], el.points[i + 1], poly)) inside++;
    }
    return inside > n / 2;
  }
  const b = elementBounds(el);
  return pointInPolygon(b.x + b.w / 2, b.y + b.h / 2, poly);
}

/** 以 (ox, oy) 為中心縮放 s 倍，再平移 (dx, dy) */
export interface Transform {
  s: number;
  ox: number;
  oy: number;
  dx: number;
  dy: number;
}

export function transformElement<T extends PageElement>(el: T, t: Transform): T {
  const mx = (x: number) => (x - t.ox) * t.s + t.ox + t.dx;
  const my = (y: number) => (y - t.oy) * t.s + t.oy + t.dy;
  if (el.type === 'stroke') {
    const points = Float32Array.from(el.points);
    for (let i = 0; i < points.length; i += 3) {
      points[i] = mx(points[i]);
      points[i + 1] = my(points[i + 1]);
    }
    return { ...el, points, width: el.width * t.s };
  }
  if (el.type === 'image') return { ...el, x: mx(el.x), y: my(el.y), w: el.w * t.s, h: el.h * t.s };
  return { ...el, x: mx(el.x), y: my(el.y), w: el.w * t.s, fontSize: el.fontSize * t.s };
}
