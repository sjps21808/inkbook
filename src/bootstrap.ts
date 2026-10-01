import type { InkDatabase } from './db/db';
import { getNotebook, listPages } from './db/repo';
import type { Notebook, Page } from './db/schema';

/** 請求持久儲存，避免 Safari 在空間不足時清掉筆記 */
export async function requestPersist(): Promise<boolean> {
  return (await navigator.storage?.persist?.()) ?? false;
}

export interface OpenedNotebook {
  notebook: Notebook;
  pages: Page[];
}

/** 讀取筆記本與頁面清單（element 由各頁掛載時載入）；找不到時回傳 null */
export async function loadNotebook(db: InkDatabase, id: string): Promise<OpenedNotebook | null> {
  const notebook = await getNotebook(db, id);
  if (!notebook) return null;
  return { notebook, pages: await listPages(db, id) };
}
