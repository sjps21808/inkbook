// 開著的筆記本分頁：介面狀態，存在 localStorage（不進 IndexedDB，也不會被備份）
const KEY = 'inkbook.tabs';

/** 開啟筆記本：還沒有分頁就加在最右邊，已經開著就不變 */
export function openTab(tabs: string[], id: string): string[] {
  return tabs.includes(id) ? tabs : [...tabs, id];
}

/**
 * 關閉分頁。關的是目前分頁時，next = 要切過去的分頁（優先右邊、沒有就左邊；全關了是 null）；
 * 關的不是目前分頁時 next = active（不切換）
 */
export function closeTab(tabs: string[], id: string, active: string | null): { tabs: string[]; next: string | null } {
  const i = tabs.indexOf(id);
  if (i < 0) return { tabs, next: active };
  const rest = tabs.filter((t) => t !== id);
  if (id !== active) return { tabs: rest, next: active };
  return { tabs: rest, next: rest[Math.min(i, rest.length - 1)] ?? null };
}

/** 拖曳排序：把 from 的分頁移到 to 的位置 */
export function moveTab(tabs: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || from >= tabs.length) return tabs;
  const next = [...tabs];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}

/** 筆記本被刪除（或還原後不存在）：拿掉它的分頁 */
export function pruneTabs(tabs: string[], exists: (id: string) => boolean): string[] {
  const next = tabs.filter(exists);
  return next.length === tabs.length ? tabs : next;
}

export function loadTabs(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveTabs(tabs: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(tabs));
  } catch {
    // 無法儲存時只影響這次使用
  }
}

/** 書架上的筆記本有變動（改名、刪除、還原）時發出，分頁列據此更新標題與拿掉不存在的分頁 */
export const NOTEBOOKS_CHANGED = 'inkbook:notebooks-changed';
