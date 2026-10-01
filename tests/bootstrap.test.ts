import { afterEach, describe, expect, it, vi } from 'vitest';
import { openFirstPage, requestPersist } from '../src/bootstrap';
import { openInkDb } from '../src/db/db';
import { listNotebooks, putElements } from '../src/db/repo';

let n = 0;

describe('openFirstPage', () => {
  it('沒有筆記本時建立一本，第二次啟動不會重複建立', async () => {
    const db = await openInkDb(`test-boot-${n++}`);
    const first = await openFirstPage(db);
    await putElements(db, [
      { id: 's', pageId: first.page.id, z: 0, type: 'stroke', tool: 'pen', color: '#000', width: 3, points: new Float32Array([1, 2, 0.5]) },
    ]);
    const second = await openFirstPage(db);
    expect(await listNotebooks(db)).toHaveLength(1);
    expect(second.page.id).toBe(first.page.id);
    expect(second.elements.map((e) => e.id)).toEqual(['s']);
    db.close();
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
