import { describe, expect, it } from 'vitest';
import { openInkDb } from '../src/db/db';
import { createPdfNotebook, getBlob, listNotebooks, listPages } from '../src/db/repo';

let n = 0;
const open = () => openInkDb(`test-pdf-nb-${n++}`);

describe('createPdfNotebook', () => {
  it('建立筆記本、一個 blob，以及每頁一個帶 pdf 欄位的 Page', async () => {
    const db = await open();
    const data = new Blob([new Uint8Array([37, 80, 68, 70])], { type: 'application/pdf' });
    const sizes = [
      { width: 595, height: 842 },
      { width: 612, height: 792 },
      { width: 842, height: 595 },
    ];
    const { notebook, pages } = await createPdfNotebook(db, { title: '講義', data, sizes });

    expect(await listNotebooks(db)).toEqual([notebook]);
    expect(notebook).toMatchObject({ title: '講義', folderId: null, template: 'blank' });
    const stored = await listPages(db, notebook.id);
    expect(stored).toEqual(pages);
    expect(stored.map((p) => p.order)).toEqual([0, 1, 2]);
    const blobId = stored[0].pdf!.blobId;
    expect(stored.map((p) => p.pdf)).toEqual([
      { blobId, pageNo: 1, srcWidth: 595, srcHeight: 842 },
      { blobId, pageNo: 2, srcWidth: 612, srcHeight: 792 },
      { blobId, pageNo: 3, srcWidth: 842, srcHeight: 595 },
    ]);
    expect(stored.every((p) => p.template === 'blank')).toBe(true);

    const rec = await getBlob(db, blobId);
    expect(rec?.mime).toBe('application/pdf');
    expect(await db.count('blobs')).toBe(1);
    expect(await db.count('elements')).toBe(0);
    db.close();
  });
});
