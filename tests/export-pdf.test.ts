// @vitest-environment node
// jsdom 的 Blob 無法被 fake-indexeddb 的 structuredClone 複製，所以用 Node 環境
import 'fake-indexeddb/auto';
import { unzlibSync } from 'fflate';
import { degrees, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, type PDFPage } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { openInkDb } from '../src/db/db';
import { addPage, createNotebook, createPdfNotebook, newId, putElements } from '../src/db/repo';
import type { StrokeElement } from '../src/db/schema';
import { exportNotebookPdf, hexColor, pdfPlacement, type Placement } from '../src/export/exportPdf';
import { pdfFit } from '../src/pdf/fit';

let n = 0;
const open = () => openInkDb(`test-export-${n++}`);

function stroke(pageId: string, z: number, tool: StrokeElement['tool'], color: string): StrokeElement {
  return {
    id: newId(),
    pageId,
    z,
    type: 'stroke',
    tool,
    color,
    width: 4,
    points: new Float32Array([100, 100, 0.5, 200, 150, 0.5, 300, 120, 0.5]),
  };
}

/** 解開頁面的 content stream（pdf-lib 預設用 Flate 壓縮） */
function contentOf(page: PDFPage): string {
  const c = page.node.Contents()!;
  const streams = c instanceof PDFArray ? c.asArray().map((r) => page.doc.context.lookup(r)) : [c];
  return streams
    .map((s) => {
      const raw = s as PDFRawStream;
      const bytes = raw.dict.get(PDFName.of('Filter')) ? unzlibSync(raw.contents) : raw.contents;
      return new TextDecoder().decode(bytes);
    })
    .join('\n');
}

describe('hexColor', () => {
  it('把 #rrggbb 轉成 0~1 的 rgb', () => {
    expect(hexColor('#ff8000')).toMatchObject({ red: 1, green: 128 / 255, blue: 0 });
  });
});

describe('exportNotebookPdf', () => {
  it('每頁輸出一張 A4，回報進度', async () => {
    const db = await open();
    const { notebook } = await createNotebook(db, { title: 'A', template: 'grid' });
    await addPage(db, notebook.id, 1, 'dot');
    await addPage(db, notebook.id, 2, 'lined');
    const progress: number[] = [];
    const bytes = await exportNotebookPdf(db, notebook.id, { onProgress: (d, t) => progress.push(d / t) });

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3);
    for (const p of doc.getPages()) expect(p.getSize()).toEqual({ width: 595, height: 842 });
    expect(progress).toEqual([1 / 3, 2 / 3, 1]);
    db.close();
  });

  it('模板線條與筆跡都是向量路徑', async () => {
    const db = await open();
    const { notebook, page } = await createNotebook(db, { title: 'A', template: 'lined' });
    await putElements(db, [stroke(page.id, 0, 'pen', '#000000')]);
    const doc = await PDFDocument.load(await exportNotebookPdf(db, notebook.id));
    const text = contentOf(doc.getPage(0));
    // 模板：描邊（S）；筆跡：二次曲線轉成的三次貝茲（c 或簡寫 v）後填色（f）
    expect(text).toMatch(/\bl\b[\s\S]*\bS\b/);
    expect(text).toMatch(/\b[cv]\b[\s\S]*\bf\b/);
    db.close();
  });

  it('螢光筆半透明 + multiply，且畫在筆之前（即使 z 比較大）', async () => {
    const db = await open();
    const { notebook, page } = await createNotebook(db, { title: 'A' });
    await putElements(db, [stroke(page.id, 0, 'pen', '#000000'), stroke(page.id, 1, 'highlighter', '#ff0000')]);
    const doc = await PDFDocument.load(await exportNotebookPdf(db, notebook.id));
    const pdfPage = doc.getPage(0);
    const text = contentOf(pdfPage);
    const hl = text.indexOf('1 0 0 rg');
    const pen = text.indexOf('0 0 0 rg');
    expect(hl).toBeGreaterThanOrEqual(0);
    expect(pen).toBeGreaterThan(hl);

    const gs = pdfPage.node.Resources()!.lookup(PDFName.of('ExtGState'), PDFDict);
    const states = gs.values().map((v) => doc.context.lookup(v, PDFDict));
    const multiply = states.find((s) => s.get(PDFName.of('BM')) === PDFName.of('Multiply'));
    expect(multiply?.get(PDFName.of('ca'))?.toString()).toBe('0.5');
    db.close();
  });
});

/** 嵌入頁的四個角經過旋轉後的位置（PDF 座標）；依序為原本的左下、右下、左上、右上 */
function corners(p: Placement): [number, number][] {
  const r = (p.rotate * Math.PI) / 180;
  const cos = Math.round(Math.cos(r));
  const sin = Math.round(Math.sin(r));
  return [
    [0, 0],
    [p.width, 0],
    [0, p.height],
    [p.width, p.height],
  ].map(([x, y]) => [p.x + x * cos - y * sin, p.y + x * sin + y * cos]);
}

describe('pdfPlacement', () => {
  // [描述, 未旋轉的頁面寬高, /Rotate, 原本左上角應該出現的位置]
  const cases: [string, number, number, number, 'tl' | 'tr' | 'br' | 'bl'][] = [
    ['Letter 直式', 612, 792, 0, 'tl'],
    ['A4 橫式', 842, 595, 0, 'tl'],
    ['Rotate 90', 612, 792, 90, 'tr'],
    ['Rotate 180', 612, 792, 180, 'br'],
    ['Rotate 270', 612, 792, 270, 'bl'],
    ['Rotate -90 = 270', 612, 792, -90, 'bl'],
  ];
  it.each(cases)('%s：旋轉後剛好蓋住 pdfFit 的範圍，方向正確', (_, w, h, rot, topLeftAt) => {
    const swap = Math.abs(rot) % 180 === 90;
    const ref = { blobId: 'b', pageNo: 1, srcWidth: swap ? h : w, srcHeight: swap ? w : h };
    const box = pdfFit(ref.srcWidth, ref.srcHeight);
    const pts = corners(pdfPlacement(ref, { width: w, height: h }, rot));
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const left = box.x;
    const right = box.x + box.w;
    const top = 842 - box.y;
    const bottom = 842 - box.y - box.h;
    expect(Math.min(...xs)).toBeCloseTo(left);
    expect(Math.max(...xs)).toBeCloseTo(right);
    expect(Math.min(...ys)).toBeCloseTo(bottom);
    expect(Math.max(...ys)).toBeCloseTo(top);
    const expected = { tl: [left, top], tr: [right, top], br: [right, bottom], bl: [left, bottom] }[topLeftAt];
    expect(pts[2][0]).toBeCloseTo(expected[0]);
    expect(pts[2][1]).toBeCloseTo(expected[1]);
  });
});

describe('exportNotebookPdf：PDF 頁', () => {
  it('匯入的頁面以 Form XObject 嵌入 A4 頁；沒有內容的空白頁只留白紙', async () => {
    const src = await PDFDocument.create();
    src.addPage([612, 792]).drawRectangle({ x: 10, y: 10, width: 50, height: 50 });
    src.addPage([612, 792]).setRotation(degrees(90));
    src.getPage(1).drawRectangle({ x: 10, y: 10, width: 50, height: 50 });
    src.addPage([595, 842]);
    const data = new Blob([(await src.save()).buffer as ArrayBuffer], { type: 'application/pdf' });
    const db = await open();
    const { notebook } = await createPdfNotebook(db, {
      title: 'P',
      data,
      sizes: [
        { width: 612, height: 792 },
        { width: 792, height: 612 },
        { width: 595, height: 842 },
      ],
    });
    const doc = await PDFDocument.load(await exportNotebookPdf(db, notebook.id));
    expect(doc.getPageCount()).toBe(3);
    const formCount = doc.getPages().map((page) => {
      expect(page.getSize()).toEqual({ width: 595, height: 842 });
      const xobjects = page.node.Resources()!.lookup(PDFName.of('XObject'));
      if (!(xobjects instanceof PDFDict)) return 0;
      return xobjects
        .values()
        .map((v) => doc.context.lookup(v) as PDFRawStream)
        .filter((x) => x.dict.get(PDFName.of('Subtype')) === PDFName.of('Form')).length;
    });
    expect(formCount).toEqual([1, 1, 0]);
    expect(contentOf(doc.getPage(0))).toMatch(/\/\S+ Do/);
    db.close();
  });
});
