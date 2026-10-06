// 編輯頁大選單（頂端列 + 工具列）收起／展開：介面偏好，存在 localStorage（跟外觀設定一樣不進 IndexedDB）
// 預設收起（常用工具在浮動快捷列）；明確存 '1'／'0'，才分得出「選過展開」與「沒設定過」
const KEY = 'inkbook.toolbarCollapsed';

export function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

export function saveCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(KEY, collapsed ? '1' : '0');
  } catch {
    // 無法儲存時只影響這次使用
  }
}
