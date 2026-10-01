import { unwrap } from 'idb';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/pdf/pdfjs', () => ({
  openPdf: vi.fn(),
  pageSizes: vi.fn(),
}));

import { openInkDb } from '../src/db/db';
import { listNotebooks, listPages } from '../src/db/repo';
import {
  ENCRYPTED,
  importPdf,
  MAX_PDF_BYTES,
  SAVE_FAILED,
  TOO_LARGE,
  TOO_MANY_PAGES,
  titleFromName,
  UNREADABLE,
} from '../src/pdf/importPdf';
import { openPdf, pageSizes } from '../src/pdf/pdfjs';

let n = 0;
const open = () => openInkDb(`test-import-pdf-${n++}`);
const pdfFile = (name = '講義.pdf', bytes = 4) => new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });
const fakeDoc = (numPages: number) => {
  const destroy = vi.fn(() => Promise.resolve());
  return { numPages, loadingTask: { destroy } };
};

describe('importPdf', () => {
  it('標題取自檔名', () => {
    expect(titleFromName('微積分 第一章.PDF')).toBe('微積分 第一章');
    expect(titleFromName('notes.v2.pdf')).toBe('notes.v2');
    expect(titleFromName('.pdf')).toBe('未命名 PDF');
  });

  it('成功時建立筆記本，每頁一個 Page，並關閉 PDF', async () => {
    const db = await open();
    const doc = fakeDoc(2);
    vi.mocked(openPdf).mockResolvedValue(doc as never);
    vi.mocked(pageSizes).mockResolvedValue([
      { width: 595, height: 842 },
      { width: 612, height: 792 },
    ]);
    const r = await importPdf(db, pdfFile());
    expect(r.ok).toBe(true);
    const [nb] = await listNotebooks(db);
    expect(r).toEqual({ ok: true, notebookId: nb.id });
    expect(nb.title).toBe('講義');
    expect((await listPages(db, nb.id)).map((p) => p.pdf?.pageNo)).toEqual([1, 2]);
    expect(doc.loadingTask.destroy).toHaveBeenCalled();
    db.close();
  });

  it('超過 100MB 時不解析、不寫入', async () => {
    const db = await open();
    vi.mocked(openPdf).mockClear();
    const big = pdfFile('big.pdf', 1);
    Object.defineProperty(big, 'size', { value: MAX_PDF_BYTES + 1 });
    expect(await importPdf(db, big)).toEqual({ ok: false, message: TOO_LARGE });
    expect(openPdf).not.toHaveBeenCalled();
    expect(await listNotebooks(db)).toEqual([]);
    db.close();
  });

  it('剛好 500 頁可以匯入，501 頁不行', async () => {
    const db = await open();
    const sizes = Array.from({ length: 500 }, () => ({ width: 595, height: 842 }));
    vi.mocked(pageSizes).mockResolvedValue(sizes);
    vi.mocked(openPdf).mockResolvedValue(fakeDoc(500) as never);
    expect((await importPdf(db, pdfFile())).ok).toBe(true);

    const doc = fakeDoc(501);
    vi.mocked(openPdf).mockResolvedValue(doc as never);
    expect(await importPdf(db, pdfFile())).toEqual({ ok: false, message: TOO_MANY_PAGES });
    expect(doc.loadingTask.destroy).toHaveBeenCalled();
    expect(await listNotebooks(db)).toHaveLength(1);
    db.close();
  });

  it('讀取失敗與密碼保護分別提示', async () => {
    const db = await open();
    vi.mocked(openPdf).mockRejectedValueOnce(Object.assign(new Error('bad'), { name: 'InvalidPDFException' }));
    expect(await importPdf(db, pdfFile())).toEqual({ ok: false, message: UNREADABLE });
    vi.mocked(openPdf).mockRejectedValueOnce(Object.assign(new Error('pw'), { name: 'PasswordException' }));
    expect(await importPdf(db, pdfFile())).toEqual({ ok: false, message: ENCRYPTED });
    expect(await listNotebooks(db)).toEqual([]);
    db.close();
  });

  it('寫入資料庫失敗時提示，不留下半套資料', async () => {
    const db = await open();
    vi.mocked(openPdf).mockResolvedValue(fakeDoc(2) as never);
    vi.mocked(pageSizes).mockResolvedValue([
      { width: 595, height: 842 },
      { width: 595, height: 842 },
    ]);
    // 模擬寫到一半失敗：第 2 頁的 pages.add 同步丟出 DataCloneError，前面已寫入的 blob、筆記本、第 1 頁都要回滾
    const orig = db.transaction.bind(db);
    const spy = vi.spyOn(db, 'transaction').mockImplementation(((...args: Parameters<typeof orig>) => {
      const raw = unwrap(orig(...args));
      const objectStore = raw.objectStore.bind(raw);
      raw.objectStore = (name: string) => {
        const s = objectStore(name);
        if (name === 'pages') {
          const add = s.add.bind(s);
          let n = 0;
          s.add = (v: unknown) => {
            if (++n === 2) throw new DOMException('cannot clone', 'DataCloneError');
            return add(v);
          };
        }
        return s;
      };
      return raw;
    }) as never);
    expect(await importPdf(db, pdfFile())).toEqual({ ok: false, message: SAVE_FAILED });
    spy.mockRestore();
    expect(await listNotebooks(db)).toEqual([]);
    expect(await db.count('pages')).toBe(0);
    expect(await db.count('blobs')).toBe(0);
    db.close();
  });
});
