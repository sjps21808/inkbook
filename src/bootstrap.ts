import type { InkDatabase } from './db/db';
import { createNotebook, listElements, listNotebooks, listPages } from './db/repo';
import type { Page, PageElement } from './db/schema';

/** 請求持久儲存，避免 Safari 在空間不足時清掉筆記 */
export async function requestPersist(): Promise<boolean> {
  return (await navigator.storage?.persist?.()) ?? false;
}

// M2：直接開啟第一本筆記本的第一頁（沒有就建立）；書架在 M3
export async function openFirstPage(db: InkDatabase): Promise<{ page: Page; elements: PageElement[] }> {
  let [notebook] = await listNotebooks(db);
  if (!notebook) notebook = (await createNotebook(db, { title: '我的筆記本' })).notebook;
  const [page] = await listPages(db, notebook.id);
  return { page, elements: await listElements(db, page.id) };
}
