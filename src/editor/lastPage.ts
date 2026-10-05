// 每本筆記本最後看的頁面：介面偏好，存在 localStorage（不進 IndexedDB，也不會被備份）
import type { Page } from '../db/schema';

const key = (notebookId: string) => `inkbook.lastPage.${notebookId}`;

/** 上次看的頁面 index；那一頁被刪掉時用上次的 index（超出範圍取最後一頁），沒有紀錄時是 0 */
export function loadLastPage(notebookId: string, pages: Page[]): number {
  try {
    const v = JSON.parse(localStorage.getItem(key(notebookId)) ?? 'null') as { id?: unknown; index?: unknown } | null;
    if (!v) return 0;
    const i = pages.findIndex((p) => p.id === v.id);
    if (i >= 0) return i;
    return typeof v.index === 'number' ? Math.max(0, Math.min(Math.floor(v.index), pages.length - 1)) : 0;
  } catch {
    return 0;
  }
}

export function saveLastPage(notebookId: string, pageId: string, index: number): void {
  try {
    localStorage.setItem(key(notebookId), JSON.stringify({ id: pageId, index }));
  } catch {
    // 無法儲存時只影響這次使用
  }
}
