import { beforeEach, describe, expect, it } from 'vitest';
import { applyTheme, loadTheme } from '../src/theme';

describe('外觀設定', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('沒有設定或設定無效時是「跟隨系統」', () => {
    expect(loadTheme()).toBe('system');
    localStorage.setItem('inkbook.theme', 'purple');
    expect(loadTheme()).toBe('system');
  });

  it('指定淺色／深色：寫到 <html data-theme> 並儲存', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(loadTheme()).toBe('dark');
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(loadTheme()).toBe('light');
  });

  it('跟隨系統：移除屬性與儲存的設定', () => {
    applyTheme('dark');
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem('inkbook.theme')).toBeNull();
  });
});
