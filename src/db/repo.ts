import type { InkDatabase } from './db';
import type { Notebook, Page, PageElement, Template } from './schema';

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
