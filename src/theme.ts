// 外觀設定：預設跟隨系統，可以手動指定淺色或深色。
// 這是介面偏好、不是筆記資料，存在 localStorage（不進 IndexedDB，也不會被備份）。
// 啟動時由 public/theme-init.js 在 <head> 套用（key 要一致）
export type Theme = 'system' | 'light' | 'dark';

export const THEMES: { id: Theme; label: string }[] = [
  { id: 'system', label: '跟隨系統' },
  { id: 'light', label: '淺色' },
  { id: 'dark', label: '深色' },
];

const KEY = 'inkbook.theme';

export function loadTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** 套用到 <html data-theme>（跟隨系統 = 移除屬性）並儲存 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = theme;
  try {
    if (theme === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // 無法儲存時只影響這次使用
  }
}
