import { beforeEach, describe, expect, it } from 'vitest';
import { loadCollapsed, saveCollapsed } from '../src/editor/chrome';

describe('選單收起狀態', () => {
  beforeEach(() => localStorage.clear());

  it('預設展開', () => {
    expect(loadCollapsed()).toBe(false);
  });

  it('收起與展開會儲存', () => {
    saveCollapsed(true);
    expect(loadCollapsed()).toBe(true);
    saveCollapsed(false);
    expect(loadCollapsed()).toBe(false);
    expect(localStorage.getItem('inkbook.toolbarCollapsed')).toBeNull();
  });
});
