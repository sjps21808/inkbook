import { beforeEach, describe, expect, it } from 'vitest';
import { closeTab, loadTabs, moveTab, openTab, pruneTabs, saveTabs } from '../src/tabs';
import { DEFAULT_TOOL, loadToolState, saveToolState } from '../src/editor/toolMemory';

describe('筆記本分頁', () => {
  beforeEach(() => localStorage.clear());

  it('開啟：沒有就加在最右邊，已開著不變', () => {
    expect(openTab(['a'], 'b')).toEqual(['a', 'b']);
    const t = ['a', 'b'];
    expect(openTab(t, 'a')).toBe(t);
  });

  it('關閉目前分頁：切到右邊，最右邊就切到左邊，全關了是 null', () => {
    expect(closeTab(['a', 'b', 'c'], 'b', 'b')).toEqual({ tabs: ['a', 'c'], next: 'c' });
    expect(closeTab(['a', 'b', 'c'], 'c', 'c')).toEqual({ tabs: ['a', 'b'], next: 'b' });
    expect(closeTab(['a'], 'a', 'a')).toEqual({ tabs: [], next: null });
  });

  it('關閉別的分頁：目前分頁不變（書架頁 active = null）', () => {
    expect(closeTab(['a', 'b'], 'a', 'b')).toEqual({ tabs: ['b'], next: 'b' });
    expect(closeTab(['a', 'b'], 'a', null)).toEqual({ tabs: ['b'], next: null });
  });

  it('拖曳排序', () => {
    expect(moveTab(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveTab(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    const t = ['a', 'b'];
    expect(moveTab(t, 1, 1)).toBe(t);
  });

  it('拿掉不存在的筆記本', () => {
    expect(pruneTabs(['a', 'b', 'c'], (id) => id !== 'b')).toEqual(['a', 'c']);
    const t = ['a'];
    expect(pruneTabs(t, () => true)).toBe(t);
  });

  it('記住分頁；資料損壞時是空的', () => {
    expect(loadTabs()).toEqual([]);
    saveTabs(['a', 'b']);
    expect(loadTabs()).toEqual(['a', 'b']);
    localStorage.setItem('inkbook.tabs', '{bad');
    expect(loadTabs()).toEqual([]);
  });

  it('每本筆記本記住工具、顏色、粗細；不合法的值用預設', () => {
    expect(loadToolState('nb')).toEqual(DEFAULT_TOOL);
    saveToolState('nb', { toolId: 'highlighter', color: '#fdd835', widthIdx: 2, options: { eraser: 'whole' } });
    expect(loadToolState('nb')).toEqual({ toolId: 'highlighter', color: '#fdd835', widthIdx: 2, options: { eraser: 'whole' } });
    expect(loadToolState('other')).toEqual(DEFAULT_TOOL);
    // 一次性工具（圖片）不能當目前工具
    localStorage.setItem('inkbook.tool.nb', JSON.stringify({ toolId: 'image', color: '#123456', widthIdx: 9 }));
    expect(loadToolState('nb')).toEqual(DEFAULT_TOOL);
    localStorage.setItem('inkbook.tool.nb', JSON.stringify({ toolId: 'pen', color: '#123456', widthIdx: 9 }));
    expect(loadToolState('nb')).toEqual({ ...DEFAULT_TOOL, toolId: 'pen' });
  });
});
