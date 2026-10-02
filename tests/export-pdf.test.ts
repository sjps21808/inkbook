// @vitest-environment node
// jsdom 的 Blob 無法被 fake-indexeddb 的 structuredClone 複製，所以用 Node 環境
import 'fake-indexeddb/auto';
import { unzlibSync } from 'fflate';
import { degrees, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, type PDFPage } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { openInkDb } from '../src/db/db';
import { addPage, createNotebook, createPdfNotebook, newId, putElements } from '../src/db/repo';
import type { ImageElement, StrokeElement, TextElement } from '../src/db/schema';
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

// 1×1 的 PNG 與 JPEG
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);
const JPEG = Uint8Array.from(
  atob(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  ),
  (c) => c.charCodeAt(0),
);

function image(pageId: string, z: number, blobId: string, box = { x: 50, y: 100, w: 200, h: 120 }): ImageElement {
  return { id: newId(), pageId, z, type: 'image', blobId, rotation: 0, ...box };
}

/** 頁面用到的 Image XObject 的 Filter */
function imageFilters(doc: PDFDocument, page: PDFPage): string[] {
  const xobjects = page.node.Resources()!.lookup(PDFName.of('XObject'));
  if (!(xobjects instanceof PDFDict)) return [];
  return xobjects
    .values()
    .map((v) => doc.context.lookup(v) as PDFRawStream)
    .filter((x) => x.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'))
    .map((x) => String(x.dict.get(PDFName.of('Filter'))))
    .sort();
}

describe('exportNotebookPdf：圖片', () => {
  it('PNG/JPEG 直接嵌入、其他格式轉成 PNG；同一張圖只嵌入一次；壞圖與缺少的 blob 略過', async () => {
    const db = await open();
    const { notebook, page } = await createNotebook(db, { title: 'I' });
    const page2 = await addPage(db, notebook.id, 1, 'blank');
    const put = (id: string, bytes: Uint8Array, mime: string) =>
      db.put('blobs', { id, data: new Blob([bytes.buffer as ArrayBuffer], { type: mime }), mime });
    await put('png', PNG, 'image/png');
    await put('jpg', JPEG, 'image/jpeg');
    await put('webp', new Uint8Array([0x52, 0x49, 0x46, 0x46]), 'image/webp');
    await put('broken', new Uint8Array([1, 2, 3]), 'image/png');
    await putElements(db, [
      image(page.id, 0, 'png'),
      image(page.id, 1, 'jpg'),
      image(page.id, 2, 'webp'),
      image(page.id, 3, 'missing'),
      image(page2.id, 0, 'webp', { x: 10, y: 20, w: 30, h: 40 }),
    ]);
    const converted: string[] = [];
    const toPng = async (data: Blob) => {
      converted.push(data.type);
      return PNG;
    };
    // broken 不是 PNG/JPEG 開頭，會走轉檔；讓轉檔失敗來模擬瀏覽器無法解碼
    await putElements(db, [image(page2.id, 1, 'broken')]);
    const failing = async (data: Blob) => {
      if (data.type === 'image/png') throw new Error('decode failed');
      return toPng(data);
    };
    const doc = await PDFDocument.load(await exportNotebookPdf(db, notebook.id, { toPng: failing }));

    expect(converted).toEqual(['image/webp']);
    expect(imageFilters(doc, doc.getPage(0))).toEqual(['/DCTDecode', '/FlateDecode', '/FlateDecode']);
    expect(imageFilters(doc, doc.getPage(1))).toEqual(['/FlateDecode']);
    // 第 2 頁的圖片：左上 (10, 20)、30×40 → PDF 座標左下 (10, 842-20-40)
    expect(contentOf(doc.getPage(1))).toMatch(/1 0 0 1 10 782 cm[\s\S]*30 0 0 40 0 0 cm/);
    db.close();
  });
});

// 專案沒有 @types/node；用變數動態 import 避免 tsc 解析模組型別
const nodeFs = 'node:fs/promises';
const readFile = async (path: string): Promise<Uint8Array> =>
  new Uint8Array(await (await import(/* @vite-ignore */ nodeFs)).readFile(path));
const loadFont = () => readFile('public/fonts/NotoSansTC-Regular.ttf');

/** 用 pdf.js 取出每頁的文字項目 */
async function extractText(bytes: Uint8Array): Promise<{ str: string; x: number; y: number; h: number }[][]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(
      content.items
        .filter((it) => 'str' in it && it.str)
        .map((it) => {
          const t = it as { str: string; transform: number[]; height: number };
          return { str: t.str, x: t.transform[4], y: t.transform[5], h: t.height };
        }),
    );
  }
  await doc.loadingTask.destroy();
  return pages;
}

function text(pageId: string, z: number, content: string, box = { x: 60, y: 100, w: 400 }): TextElement {
  return { id: newId(), pageId, z, type: 'text', content, fontSize: 20, color: '#1c1c1e', ...box };
}

describe('exportNotebookPdf：文字', () => {
  it('嵌入 Noto Sans TC subset，中英文都能取出；斷行與換行保留', async () => {
    const db = await open();
    const { notebook, page } = await createNotebook(db, { title: 'T' });
    await putElements(db, [
      text(page.id, 0, '你好，InkBook 筆記 123\n第二行'),
      // 寬度只夠放 3 個 20pt 的全形字 → 斷成 2 行
      text(page.id, 1, '一二三四五六', { x: 60, y: 300, w: 61 }),
    ]);
    const bytes = await exportNotebookPdf(db, notebook.id, { loadFont });
    // subset：輸出遠小於 7MB 的完整字型
    expect(bytes.length).toBeLessThan(200_000);

    const [items] = await extractText(bytes);
    expect(items.map((i) => i.str)).toEqual(['你好，InkBook 筆記 123', '第二行', '一二三', '四五六']);
    // 左邊對齊文字框；同一個文字框的行距 = 20 × 1.4 = 28pt
    expect(items[0].x).toBeCloseTo(60);
    expect(items[0].y - items[1].y).toBeCloseTo(28);
    expect(items[2].y - items[3].y).toBeCloseTo(28);
    // 第一行基線在文字框頂端往下約一個字高之內
    const baselineFromTop = 842 - items[0].y - 100;
    expect(baselineFromTop).toBeGreaterThan(14);
    expect(baselineFromTop).toBeLessThan(28);
    db.close();
  });

  it('沒有文字時不載入字型', async () => {
    const db = await open();
    const { notebook } = await createNotebook(db, { title: 'T' });
    let loaded = 0;
    await exportNotebookPdf(db, notebook.id, {
      loadFont: () => {
        loaded++;
        return loadFont();
      },
    });
    expect(loaded).toBe(0);
    db.close();
  });
});
