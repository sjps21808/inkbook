import { newId } from '../../db/repo';
import { PAGE_WIDTH, type TextElement } from '../../db/schema';
import { elementBounds, TEXT_LINE_HEIGHT } from '../geometry';
import type { Point, ToolContext, ToolSession } from './types';

const DEFAULT_TEXT_WIDTH = 240;
const MIN_TEXT_WIDTH = 80;
const PAGE_MARGIN = 16;

/** 文字：用筆點既有的文字框 = 編輯，點空白處 = 新增（放開時才開始編輯） */
export function textSession(ctx: ToolContext, at: Point): ToolSession {
  return {
    move() {},
    up() {
      const hit = ctx.elements
        .filter((e): e is TextElement => e.type === 'text')
        .sort((a, b) => b.z - a.z)
        .find((e) => {
          const b = elementBounds(e);
          return at.x >= b.x && at.x <= b.x + b.w && at.y >= b.y && at.y <= b.y + b.h;
        });
      if (hit) {
        ctx.editText(hit);
        return;
      }
      const fontSize = ctx.width;
      const x = Math.min(at.x, PAGE_WIDTH - PAGE_MARGIN - MIN_TEXT_WIDTH);
      ctx.editText({
        id: newId(),
        pageId: ctx.pageId,
        z: ctx.elements.reduce((m, e) => Math.max(m, e.z), -1) + 1,
        type: 'text',
        x,
        // 點的位置落在第一行中間
        y: at.y - (fontSize * TEXT_LINE_HEIGHT) / 2,
        w: Math.min(DEFAULT_TEXT_WIDTH, PAGE_WIDTH - PAGE_MARGIN - x),
        content: '',
        fontSize,
        color: ctx.color,
      });
    },
  };
}
