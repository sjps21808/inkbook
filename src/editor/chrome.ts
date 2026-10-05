// 編輯頁上方選單（頂端列 + 工具列）收起／展開：介面偏好，存在 localStorage（跟外觀設定一樣不進 IndexedDB）
const KEY = 'inkbook.toolbarCollapsed';

export function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function saveCollapsed(collapsed: boolean): void {
  try {
    if (collapsed) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    // 無法儲存時只影響這次使用
  }
}
