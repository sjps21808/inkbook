import { PAGE_HEIGHT, PAGE_WIDTH, type Page, type Template } from '../db/schema';

export const TEMPLATES: { id: Template; label: string }[] = [
  { id: 'blank', label: '空白' },
  { id: 'lined', label: '橫線' },
  { id: 'grid', label: '方格' },
  { id: 'dot', label: '點陣' },
];

/** 翻過最後一頁自動新增的頁面模板：與最後一頁相同；PDF 頁改用筆記本預設模板 */
export function nextPageTemplate(last: Page, notebookTemplate: Template): Template {
  return last.pdf ? notebookTemplate : last.template;
}

export const TEMPLATE_COLOR = '#c8d3e0';
export const TEMPLATE_LINE_WIDTH = 0.5;
export const DOT_RADIUS = 0.5;

const LINE_GAP = 24;
const LINE_TOP = 72;
const LINE_SIDE = 36;
const MM5 = (5 * 72) / 25.4;

export interface TemplateShapes {
  /** [x1, y1, x2, y2]（pt） */
  lines: [number, number, number, number][];
  /** [x, y]（pt） */
  dots: [number, number][];
}

/** 模板的向量幾何（canvas 繪製與 M7 匯出 PDF 共用） */
export function templateShapes(t: Template): TemplateShapes {
  const lines: TemplateShapes['lines'] = [];
  const dots: TemplateShapes['dots'] = [];
  if (t === 'lined') {
    for (let y = LINE_TOP; y <= PAGE_HEIGHT - LINE_SIDE; y += LINE_GAP) {
      lines.push([LINE_SIDE, y, PAGE_WIDTH - LINE_SIDE, y]);
    }
  } else if (t === 'grid') {
    for (let x = MM5; x < PAGE_WIDTH; x += MM5) lines.push([x, 0, x, PAGE_HEIGHT]);
    for (let y = MM5; y < PAGE_HEIGHT; y += MM5) lines.push([0, y, PAGE_WIDTH, y]);
  } else if (t === 'dot') {
    for (let y = MM5; y < PAGE_HEIGHT; y += MM5) {
      for (let x = MM5; x < PAGE_WIDTH; x += MM5) dots.push([x, y]);
    }
  }
  return { lines, dots };
}

/** 在 bg canvas 上畫白紙與模板；scale = canvas 像素 / pt */
export function drawTemplate(ctx: CanvasRenderingContext2D, t: Template, scale: number): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const { lines, dots } = templateShapes(t);
  if (lines.length) {
    ctx.strokeStyle = TEMPLATE_COLOR;
    ctx.lineWidth = TEMPLATE_LINE_WIDTH;
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of lines) {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
  }
  if (dots.length) {
    ctx.fillStyle = TEMPLATE_COLOR;
    ctx.beginPath();
    for (const [x, y] of dots) {
      ctx.moveTo(x + DOT_RADIUS, y);
      ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.restore();
}
