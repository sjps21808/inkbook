import { beforeEach, describe, expect, it } from 'vitest';
import type { Page } from '../src/db/schema';
import { loadLastPage, saveLastPage } from '../src/editor/lastPage';

const pages = (...ids: string[]): Page[] =>
  ids.map((id, order) => ({ id, notebookId: 'nb', order, template: 'blank' }));

describe('最後看的頁面', () => {
  beforeEach(() => localStorage.clear());

  it('沒有紀錄時是第 1 頁', () => {
    expect(loadLastPage('nb', pages('a', 'b'))).toBe(0);
  });

  it('依頁面 id 找回（頁面重新排序後仍正確）', () => {
    saveLastPage('nb', 'b', 1);
    expect(loadLastPage('nb', pages('b', 'a', 'c'))).toBe(0);
    expect(loadLastPage('nb', pages('a', 'c', 'b'))).toBe(2);
  });

  it('那一頁被刪掉時停在最接近的頁', () => {
    saveLastPage('nb', 'c', 2);
    expect(loadLastPage('nb', pages('a', 'b', 'd'))).toBe(2);
    expect(loadLastPage('nb', pages('a', 'b'))).toBe(1);
  });

  it('各筆記本分開記錄；資料損壞時回到第 1 頁', () => {
    saveLastPage('nb', 'b', 1);
    expect(loadLastPage('other', pages('a', 'b'))).toBe(0);
    localStorage.setItem('inkbook.lastPage.nb', '{bad');
    expect(loadLastPage('nb', pages('a', 'b'))).toBe(0);
  });
});
