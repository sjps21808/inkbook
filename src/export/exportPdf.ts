import { BlendMode, PDFDocument, rgb, type Color, type PDFPage } from 'pdf-lib';
import type { InkDatabase } from '../db/db';
import { listElements, listPages } from '../db/repo';
import { PAGE_HEIGHT, PAGE_WIDTH, type PageElement, type StrokeElement, type Template } from '../db/schema';
import { HIGHLIGHTER_ALPHA, inkOrder, outlineToSvgPath, strokeOutline } from '../editor/stroke';
import { DOT_RADIUS, TEMPLATE_COLOR, TEMPLATE_LINE_WIDTH, templateShapes } from '../editor/templates';

export interface ExportOptions {
  /** 每完成一頁呼叫一次 */
  onProgress?(done: number, total: number): void;
}

/** '#rrggbb' → pdf-lib 顏色 */
export function hexColor(hex: string): Color {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** pdf-lib 的 drawSvgPath 以 (x, y) 為原點、y 軸朝下，放在頁面左上角就和 canvas 座標一致 */
const TOP_LEFT = { x: 0, y: PAGE_HEIGHT };

function drawTemplate(page: PDFPage, t: Template): void {
  const { lines, dots } = templateShapes(t);
  const color = hexColor(TEMPLATE_COLOR);
  if (lines.length) {
    const d = lines.map(([x1, y1, x2, y2]) => `M${x1} ${y1}L${x2} ${y2}`).join('');
    page.drawSvgPath(d, { ...TOP_LEFT, borderColor: color, borderWidth: TEMPLATE_LINE_WIDTH });
  }
  if (dots.length) {
    const r = DOT_RADIUS;
    const d = dots.map(([x, y]) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`).join('');
    page.drawSvgPath(d, { ...TOP_LEFT, color });
  }
}

function drawStroke(page: PDFPage, s: StrokeElement): void {
  const d = outlineToSvgPath(strokeOutline(s.points, s.width));
  if (!d) return;
  const hl = s.tool === 'highlighter';
  page.drawSvgPath(d, {
    ...TOP_LEFT,
    color: hexColor(s.color),
    opacity: hl ? HIGHLIGHTER_ALPHA : 1,
    blendMode: hl ? BlendMode.Multiply : BlendMode.Normal,
  });
}

function drawElements(page: PDFPage, els: PageElement[]): void {
  for (const e of inkOrder(els)) {
    if (e.type === 'stroke') drawStroke(page, e);
  }
}

/** 把整本筆記本匯出成 PDF（每頁 A4，向量輸出） */
export async function exportNotebookPdf(db: InkDatabase, notebookId: string, opts: ExportOptions = {}): Promise<Uint8Array> {
  const pages = await listPages(db, notebookId);
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawTemplate(page, p.template);
    drawElements(page, await listElements(db, p.id));
    opts.onProgress?.(i + 1, pages.length);
  }
  return doc.save();
}
