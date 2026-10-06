import { beforeEach, describe, expect, it } from 'vitest';
import { loadCollapsed, saveCollapsed } from '../src/editor/chrome';

describe('選單收起狀態', () => {
  beforeEach(() => localStorage.clear());

  it('預設收起（沒設定過，包括舊版「展開」時刪掉設定的情況）', () => {
    expect(loadCollapsed()).toBe(true);
  });

  it('收起與展開會儲存', () => {
    saveCollapsed(true);
    expect(loadCollapsed()).toBe(true);
    saveCollapsed(false);
    expect(loadCollapsed()).toBe(false);
    expect(localStorage.getItem('inkbook.toolbarCollapsed')).toBe('0');
  });
});
