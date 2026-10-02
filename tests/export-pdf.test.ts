import 'fake-indexeddb/auto';
import { unzlibSync } from 'fflate';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, type PDFPage } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { openInkDb } from '../src/db/db';
import { addPage, createNotebook, newId, putElements } from '../src/db/repo';
import type { StrokeElement } from '../src/db/schema';
import { exportNotebookPdf, hexColor } from '../src/export/exportPdf';

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
