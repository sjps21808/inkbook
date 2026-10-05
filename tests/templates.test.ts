import { describe, expect, it } from 'vitest';
import type { Page } from '../src/db/schema';
import { drawTemplate, nextPageTemplate, templateShapes } from '../src/editor/templates';

const MM5 = (5 * 72) / 25.4;

describe('nextPageTemplate', () => {
  const page = (p: Partial<Page>): Page => ({ id: 'p', notebookId: 'nb', order: 0, template: 'blank', ...p });

  it('與最後一頁相同', () => {
    expect(nextPageTemplate(page({ template: 'grid' }), 'lined')).toBe('grid');
  });

  it('最後一頁是 PDF 頁時用筆記本預設模板', () => {
    const pdf = { blobId: 'b', pageNo: 1, srcWidth: 595, srcHeight: 842 };
    expect(nextPageTemplate(page({ template: 'blank', pdf }), 'dot')).toBe('dot');
  });
});

describe('templateShapes', () => {
  it('空白沒有任何線條或點', () => {
    expect(templateShapes('blank')).toEqual({ lines: [], dots: [] });
  });

  it('橫線：間距 24pt、從 72pt 開始、左右留 36pt', () => {
    const { lines } = templateShapes('lined');
    expect(lines[0]).toEqual([36, 72, 559, 72]);
    expect(lines[1][1] - lines[0][1]).toBe(24);
    expect(lines.at(-1)![1]).toBeLessThanOrEqual(842 - 36);
    expect(lines).toHaveLength(31);
  });

  it('方格：5mm，41 條直線 + 59 條橫線', () => {
    const { lines } = templateShapes('grid');
    const v = lines.filter(([x1, , x2]) => x1 === x2);
    const h = lines.filter(([, y1, , y2]) => y1 === y2);
    expect(v).toHaveLength(41);
    expect(h).toHaveLength(59);
    expect(v[1][0] - v[0][0]).toBeCloseTo(MM5, 5);
  });

  it('點陣：5mm 間距，41 × 59 個點', () => {
    const { dots } = templateShapes('dot');
    expect(dots).toHaveLength(41 * 59);
    expect(dots[1][0] - dots[0][0]).toBeCloseTo(MM5, 5);
  });
});

describe('drawTemplate', () => {
  const fakeCtx = () => {
    const calls: string[] = [];
    const ctx = {
      canvas: { width: 100, height: 100 },
      save() {},
      restore() {},
      setTransform: (...a: number[]) => calls.push(`T${a[0]}`),
      fillRect: () => calls.push('fillRect'),
      beginPath() {},
      moveTo() {},
      lineTo: () => calls.push('lineTo'),
      arc: () => calls.push('arc'),
      stroke: () => calls.push('stroke'),
      fill: () => calls.push('fill'),
    } as unknown as CanvasRenderingContext2D;
    return { ctx, calls };
  };

  it('先鋪白紙，再依 scale 畫線', () => {
    const { ctx, calls } = fakeCtx();
    drawTemplate(ctx, 'lined', 2);
    expect(calls.slice(0, 3)).toEqual(['T1', 'fillRect', 'T2']);
    expect(calls.filter((c) => c === 'lineTo')).toHaveLength(31);
    expect(calls.at(-1)).toBe('stroke');
  });

  it('點陣用 arc 畫點', () => {
    const { ctx, calls } = fakeCtx();
    drawTemplate(ctx, 'dot', 1);
    expect(calls.filter((c) => c === 'arc')).toHaveLength(41 * 59);
    expect(calls.at(-1)).toBe('fill');
  });
});
