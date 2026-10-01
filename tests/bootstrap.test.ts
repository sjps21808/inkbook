import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadNotebook, requestPersist } from '../src/bootstrap';
import { openInkDb } from '../src/db/db';
import { addPage, createNotebook } from '../src/db/repo';
import { notebookHash, parseHash } from '../src/router';

let n = 0;

describe('loadNotebook', () => {
  it('讀取筆記本與依順序排列的頁面；找不到時回傳 null', async () => {
    const db = await openInkDb(`test-boot-${n++}`);
    const { notebook, page } = await createNotebook(db, { title: 'nb' });
    const p0 = await addPage(db, notebook.id, 0, 'grid');
    const opened = await loadNotebook(db, notebook.id);
    expect(opened?.notebook.title).toBe('nb');
    expect(opened?.pages.map((p) => p.id)).toEqual([p0.id, page.id]);
    expect(await loadNotebook(db, 'missing')).toBeNull();
    db.close();
  });
});

describe('router', () => {
  it('解析 hash', () => {
    expect(parseHash('')).toEqual({ name: 'library' });
    expect(parseHash('#/')).toEqual({ name: 'library' });
    expect(parseHash(notebookHash('a b'))).toEqual({ name: 'notebook', id: 'a b' });
  });
});

describe('requestPersist', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('呼叫 navigator.storage.persist()', async () => {
    const persist = vi.fn(async () => true);
    vi.stubGlobal('navigator', { storage: { persist } });
    expect(await requestPersist()).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });

  it('不支援時回傳 false，不會拋錯', async () => {
    vi.stubGlobal('navigator', {});
    expect(await requestPersist()).toBe(false);
  });
});
