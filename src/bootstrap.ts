import type { InkDatabase } from './db/db';
import { getNotebook, listElements, listPages } from './db/repo';
import type { Notebook, Page, PageElement } from './db/schema';

/** 請求持久儲存，避免 Safari 在空間不足時清掉筆記 */
export async function requestPersist(): Promise<boolean> {
  return (await navigator.storage?.persist?.()) ?? false;
}

export interface OpenedNotebook {
  notebook: Notebook;
  page: Page;
  elements: PageElement[];
}

/** 讀取筆記本與第一頁；找不到時回傳 null */
export async function loadNotebook(db: InkDatabase, id: string): Promise<OpenedNotebook | null> {
  const notebook = await getNotebook(db, id);
  if (!notebook) return null;
  const [page] = await listPages(db, id);
  return { notebook, page, elements: await listElements(db, page.id) };
}
