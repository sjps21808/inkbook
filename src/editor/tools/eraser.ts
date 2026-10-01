import { newId } from '../../db/repo';
import type { PageElement, StrokeElement } from '../../db/schema';
import { eraseStroke, strokeHit } from '../geometry';
import type { Point, ToolContext, ToolSession } from './types';

/**
 * 橡皮擦：局部擦除把筆畫切成多段，整筆擦除直接刪掉碰到的筆畫。
 * 一次拖曳 = 一個動作；undo 時刪掉碎片、放回原本的那一筆。
 */
export function eraserSession(ctx: ToolContext, at: Point): ToolSession {
  const r = ctx.width;
  const whole = ctx.option === 'whole';
  let work: PageElement[] = ctx.elements;
  /** 碎片 id → 原本那一筆的 id */
  const origin = new Map<string, string>();
  const removed = new Set<string>();
  let last = at;

  const eraseAt = (x: number, y: number): boolean => {
    let changed = false;
    const next: PageElement[] = [];
    for (const el of work) {
      if (el.type !== 'stroke') {
        next.push(el);
        continue;
      }
      const R = r + el.width / 2;
      const src = origin.get(el.id) ?? el.id;
      if (whole) {
        if (strokeHit(el.points, x, y, R)) {
          removed.add(src);
          changed = true;
        } else next.push(el);
        continue;
      }
      const pieces = eraseStroke(el.points, x, y, R);
      if (!pieces) {
        next.push(el);
        continue;
      }
      removed.add(src);
      changed = true;
      for (const points of pieces) {
        const piece: StrokeElement = { ...el, id: newId(), points };
        origin.set(piece.id, src);
        next.push(piece);
      }
    }
    if (changed) work = next;
    return changed;
  };

  const step = (p: Point) => {
    // 兩次事件之間依半徑補點，快速拖曳也不會漏擦
    const n = Math.max(1, Math.ceil(Math.hypot(p.x - last.x, p.y - last.y) / (r / 2)));
    let changed = false;
    for (let i = 1; i <= n; i++) {
      changed = eraseAt(last.x + ((p.x - last.x) * i) / n, last.y + ((p.y - last.y) * i) / n) || changed;
    }
    last = p;
    if (changed) ctx.preview(work);
    ctx.drawLive((c) => {
      c.beginPath();
      c.arc(p.x, p.y, r, 0, Math.PI * 2);
      c.lineWidth = ctx.ptPerPx;
      c.strokeStyle = '#8e8e93';
      c.stroke();
    });
  };

  step(at);
  return {
    move: step,
    up(p) {
      step(p);
      ctx.drawLive(null);
      if (!removed.size) {
        ctx.preview(null);
        return;
      }
      const before = ctx.elements.filter((e) => removed.has(e.id));
      const added = work.filter((e) => origin.has(e.id));
      ctx.commit(added, before);
    },
  };
}
