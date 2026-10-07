import type { PageElement } from '../../db/schema';
import { elementBounds, lassoHit, transformElement, unionBounds, type Rect, type Transform } from '../geometry';
import type { Point, ToolContext, ToolSession } from './types';

/** 選取框比內容外擴的距離與縮放把手的觸控半徑（CSS px） */
export const SELECTION_PAD_PX = 8;
const HANDLE_HIT_PX = 24;
const MIN_SCALE = 0.1;
const MAX_SCALE = 10;

/** 選取中 element 的外框（不含外擴） */
export function selectionBounds(els: PageElement[], ids: string[]): Rect | null {
  const set = new Set(ids);
  return unionBounds(els.filter((e) => set.has(e.id)).map(elementBounds));
}

/** 預覽並在放開時寫入：被選取的 element 套用 transform */
function transformSession(ctx: ToolContext, make: (p: Point) => Transform | null): ToolSession {
  const set = new Set(ctx.selection);
  let moved: PageElement[] = [];
  const update = (p: Point) => {
    const t = make(p);
    if (!t) return;
    moved = ctx.elements.filter((e) => set.has(e.id)).map((e) => transformElement(e, t));
    const byId = new Map(moved.map((e) => [e.id, e]));
    ctx.preview(ctx.elements.map((e) => byId.get(e.id) ?? e));
  };
  return {
    move: update,
    up(p) {
      update(p);
      if (!moved.length) return;
      ctx.commit(moved, ctx.elements.filter((e) => set.has(e.id)));
    },
  };
}

/** 矩形套索：對角兩點 a、b 圍成的矩形（四個角的多邊形，判斷規則與自由套索相同） */
export function rectPolygon(a: Point, b: Point): number[] {
  return [a.x, a.y, b.x, a.y, b.x, b.y, a.x, b.y];
}

/** 套索：在選取框內拖曳 = 移動，拖右下角把手 = 等比縮放，其他地方 = 重新圈選（自由或矩形） */
export function lassoSession(ctx: ToolContext, at: Point): ToolSession {
  const box = selectionBounds(ctx.elements, ctx.selection);
  if (box) {
    const pad = SELECTION_PAD_PX * ctx.ptPerPx;
    const x0 = box.x - pad;
    const y0 = box.y - pad;
    const x1 = box.x + box.w + pad;
    const y1 = box.y + box.h + pad;
    if (Math.hypot(at.x - x1, at.y - y1) <= HANDLE_HIT_PX * ctx.ptPerPx) {
      // 以左上角為中心，依拖曳點在對角線上的投影決定倍率
      const bw = x1 - x0;
      const bh = y1 - y0;
      return transformSession(ctx, (p) => {
        const proj = ((p.x - x0) * bw + (p.y - y0) * bh) / (bw * bw + bh * bh);
        const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, proj));
        return { s, ox: box.x, oy: box.y, dx: 0, dy: 0 };
      });
    }
    if (at.x >= x0 && at.x <= x1 && at.y >= y0 && at.y <= y1) {
      return transformSession(ctx, (p) =>
        p.x === at.x && p.y === at.y ? null : { s: 1, ox: 0, oy: 0, dx: p.x - at.x, dy: p.y - at.y },
      );
    }
  }

  const rect = ctx.option === 'rect';
  let poly = rect ? rectPolygon(at, at) : [at.x, at.y];
  const draw = () =>
    ctx.drawLive((c) => {
      c.beginPath();
      c.moveTo(poly[0], poly[1]);
      for (let i = 2; i < poly.length; i += 2) c.lineTo(poly[i], poly[i + 1]);
      c.closePath();
      c.setLineDash([4 * ctx.ptPerPx, 4 * ctx.ptPerPx]);
      c.lineWidth = ctx.ptPerPx;
      c.strokeStyle = '#0a84ff';
      c.stroke();
    });
  ctx.select([]);
  draw();
  return {
    move(p) {
      if (rect) poly = rectPolygon(at, p);
      else poly.push(p.x, p.y);
      draw();
    },
    up(p) {
      if (rect) poly = rectPolygon(at, p);
      else poly.push(p.x, p.y);
      ctx.drawLive(null);
      // 自由：至少三個點；矩形：寬高都不能是 0
      const ok = rect ? p.x !== at.x && p.y !== at.y : poly.length >= 6;
      ctx.select(ok ? ctx.elements.filter((e) => lassoHit(e, poly)).map((e) => e.id) : []);
    },
  };
}
