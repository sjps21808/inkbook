import type { IDBPTransaction } from 'idb';
import type { InkDatabase } from './db';
import type { BlobRecord, InkDB, Notebook, Page, PageElement, Template } from './schema';

export const newId = () => crypto.randomUUID();

export async function createNotebook(
  db: InkDatabase,
  init: { title: string; coverColor?: string; template?: Template; folderId?: string | null },
): Promise<{ notebook: Notebook; page: Page }> {
  const now = Date.now();
  const notebook: Notebook = {
    id: newId(),
    title: init.title,
    folderId: init.folderId ?? null,
    coverColor: init.coverColor ?? '#1e88e5',
    template: init.template ?? 'blank',
    createdAt: now,
    updatedAt: now,
  };
  const page: Page = { id: newId(), notebookId: notebook.id, order: 0, template: notebook.template };
  const tx = db.transaction(['notebooks', 'pages'], 'readwrite');
  await Promise.all([tx.objectStore('notebooks').add(notebook), tx.objectStore('pages').add(page), tx.done]);
  return { notebook, page };
}

export interface PdfPageSize {
  width: number;
  height: number;
}

/** 匯入 PDF：一次寫入筆記本、PDF blob，以及每個 PDF 頁對應的 Page（不預先渲染） */
export async function createPdfNotebook(
  db: InkDatabase,
  init: { title: string; data: Blob; sizes: PdfPageSize[] },
): Promise<{ notebook: Notebook; pages: Page[] }> {
  const now = Date.now();
  const notebook: Notebook = {
    id: newId(),
    title: init.title,
    folderId: null,
    coverColor: '#e53935',
    template: 'blank',
    createdAt: now,
    updatedAt: now,
  };
  const blob: BlobRecord = { id: newId(), data: init.data, mime: 'application/pdf' };
  const pages: Page[] = init.sizes.map((s, i) => ({
    id: newId(),
    notebookId: notebook.id,
    order: i,
    template: 'blank',
    pdf: { blobId: blob.id, pageNo: i + 1, srcWidth: s.width, srcHeight: s.height },
  }));
  const tx = db.transaction(['notebooks', 'pages', 'blobs'], 'readwrite');
  await Promise.all([
    tx.objectStore('blobs').add(blob),
    tx.objectStore('notebooks').add(notebook),
    ...pages.map((p) => tx.objectStore('pages').add(p)),
    tx.done,
  ]);
  return { notebook, pages };
}

export function getBlob(db: InkDatabase, id: string): Promise<BlobRecord | undefined> {
  return db.get('blobs', id);
}

export function getNotebook(db: InkDatabase, id: string): Promise<Notebook | undefined> {
  return db.get('notebooks', id);
}

export function listNotebooks(db: InkDatabase): Promise<Notebook[]> {
  return db.getAll('notebooks');
}

export async function listPages(db: InkDatabase, notebookId: string): Promise<Page[]> {
  const pages = await db.getAllFromIndex('pages', 'notebookId', notebookId);
  return pages.sort((a, b) => a.order - b.order);
}

export async function listElements(db: InkDatabase, pageId: string): Promise<PageElement[]> {
  const els = await db.getAllFromIndex('elements', 'pageId', pageId);
  return els.sort((a, b) => a.z - b.z);
}

/** 新增或還原 element，並更新所屬筆記本的 updatedAt */
export function putElements(db: InkDatabase, els: PageElement[]): Promise<void> {
  return writeElements(db, els, 'put');
}

/** 刪除 element，並更新所屬筆記本的 updatedAt */
export function deleteElements(db: InkDatabase, els: PageElement[]): Promise<void> {
  return writeElements(db, els, 'delete');
}

async function writeElements(db: InkDatabase, els: PageElement[], mode: 'put' | 'delete') {
  const tx = db.transaction(['elements', 'pages', 'notebooks'], 'readwrite');
  const store = tx.objectStore('elements');
  const writes = els.map((el) => (mode === 'put' ? store.put(el) : store.delete(el.id)));
  const touch = async () => {
    const now = Date.now();
    for (const pageId of new Set(els.map((el) => el.pageId))) {
      const page = await tx.objectStore('pages').get(pageId);
      const nb = page && (await tx.objectStore('notebooks').get(page.notebookId));
      if (nb) await tx.objectStore('notebooks').put({ ...nb, updatedAt: now });
    }
  };
  await Promise.all([...writes, touch(), tx.done]);
}

/** 刪除筆記本，連同它的頁面與 element */
export async function deleteNotebook(db: InkDatabase, notebookId: string): Promise<void> {
  const tx = db.transaction(['notebooks', 'pages', 'elements'], 'readwrite');
  const run = async () => {
    const pageIds = await tx.objectStore('pages').index('notebookId').getAllKeys(notebookId);
    for (const pageId of pageIds) {
      const elIds = await tx.objectStore('elements').index('pageId').getAllKeys(pageId);
      await Promise.all(elIds.map((id) => tx.objectStore('elements').delete(id)));
      await tx.objectStore('pages').delete(pageId);
    }
    await tx.objectStore('notebooks').delete(notebookId);
  };
  await Promise.all([run(), tx.done]);
}

type PageTx = IDBPTransaction<InkDB, ('notebooks' | 'pages' | 'elements')[], 'readwrite'>;

const pageTx = (db: InkDatabase): PageTx => db.transaction(['notebooks', 'pages', 'elements'], 'readwrite');

async function pagesIn(tx: PageTx, notebookId: string): Promise<Page[]> {
  const pages = await tx.objectStore('pages').index('notebookId').getAll(notebookId);
  return pages.sort((a, b) => a.order - b.order);
}

/** 依陣列順序重寫 order = 0..n-1（只寫入有變動的頁面） */
async function renumber(tx: PageTx, pages: Page[]): Promise<void> {
  await Promise.all(
    pages.map((p, i) => (p.order === i ? undefined : tx.objectStore('pages').put({ ...p, order: i }))),
  );
}

async function touchNotebook(tx: PageTx, notebookId: string): Promise<void> {
  const nb = await tx.objectStore('notebooks').get(notebookId);
  if (nb) await tx.objectStore('notebooks').put({ ...nb, updatedAt: Date.now() });
}

async function inPageTx<T>(db: InkDatabase, run: (tx: PageTx) => Promise<T>): Promise<T> {
  const tx = pageTx(db);
  const [result] = await Promise.all([run(tx), tx.done]);
  return result;
}

/** 在 index 位置插入新頁面 */
export function addPage(db: InkDatabase, notebookId: string, index: number, template: Template): Promise<Page> {
  return inPageTx(db, async (tx) => {
    const pages = await pagesIn(tx, notebookId);
    const page: Page = { id: newId(), notebookId, order: index, template };
    await tx.objectStore('pages').add(page);
    pages.splice(index, 0, page);
    await renumber(tx, pages);
    await touchNotebook(tx, notebookId);
    return { ...page, order: pages.indexOf(page) };
  });
}

export interface PageSnapshot {
  page: Page;
  elements: PageElement[];
}

/** 刪除頁面與它的 element，回傳快照供 undo 還原 */
export function deletePage(db: InkDatabase, pageId: string): Promise<PageSnapshot> {
  return inPageTx(db, async (tx) => {
    const page = (await tx.objectStore('pages').get(pageId))!;
    const elements = await tx.objectStore('elements').index('pageId').getAll(pageId);
    await Promise.all(elements.map((e) => tx.objectStore('elements').delete(e.id)));
    await tx.objectStore('pages').delete(pageId);
    await renumber(tx, await pagesIn(tx, page.notebookId));
    await touchNotebook(tx, page.notebookId);
    return { page, elements };
  });
}

/** 把刪除的頁面放回原本的位置 */
export function restorePage(db: InkDatabase, snap: PageSnapshot): Promise<void> {
  return inPageTx(db, async (tx) => {
    const pages = await pagesIn(tx, snap.page.notebookId);
    await tx.objectStore('pages').put(snap.page);
    await Promise.all(snap.elements.map((e) => tx.objectStore('elements').put(e)));
    pages.splice(snap.page.order, 0, snap.page);
    await renumber(tx, pages);
    await touchNotebook(tx, snap.page.notebookId);
  });
}

/** 依 pageIds 的順序重新排序 */
export function reorderPages(db: InkDatabase, notebookId: string, pageIds: string[]): Promise<void> {
  return inPageTx(db, async (tx) => {
    const byId = new Map((await pagesIn(tx, notebookId)).map((p) => [p.id, p]));
    await renumber(tx, pageIds.map((id) => byId.get(id)!));
    await touchNotebook(tx, notebookId);
  });
}
