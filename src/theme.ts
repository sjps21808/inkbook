// 外觀設定：只有淺色、深色（2026-10-10 使用者決定，拿掉「跟隨系統」）。
// 第一次開啟時依系統決定並儲存，之後固定，不再跟著系統變。
// 這是介面偏好、不是筆記資料，存在 localStorage（不進 IndexedDB，也不會被備份）。
// 啟動時由 public/theme-init.js 在 <head> 套用（key 與預設邏輯要一致）
export type Theme = 'light' | 'dark';

export const THEMES: { id: Theme; label: string }[] = [
  { id: 'light', label: '淺色' },
  { id: 'dark', label: '深色' },
];

const KEY = 'inkbook.theme';

const systemTheme = (): Theme => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export function loadTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : systemTheme();
  } catch {
    return systemTheme();
  }
}

/** 套用到 <html data-theme> 並儲存 */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // 無法儲存時只影響這次使用
  }
}
