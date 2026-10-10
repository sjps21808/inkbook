import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, loadTheme, THEMES } from '../src/theme';

const systemDark = (dark: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: dark && q.includes('dark') }) as MediaQueryList);

describe('外觀設定', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    systemDark(false);
  });

  it('只有淺色、深色兩個選項（沒有跟隨系統）', () => {
    expect(THEMES.map((t) => t.label)).toEqual(['淺色', '深色']);
  });

  it('沒有設定或設定無效時依系統決定', () => {
    expect(loadTheme()).toBe('light');
    systemDark(true);
    expect(loadTheme()).toBe('dark');
    localStorage.setItem('inkbook.theme', 'system');
    expect(loadTheme()).toBe('dark');
  });

  it('指定淺色／深色：寫到 <html data-theme> 並儲存，之後不受系統影響', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(loadTheme()).toBe('dark');
    applyTheme('light');
    systemDark(true);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(loadTheme()).toBe('light');
  });
});
