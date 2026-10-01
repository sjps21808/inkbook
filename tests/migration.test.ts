import { describe, expect, it, vi } from 'vitest';
import { migrations, openInkDb, type Migration } from '../src/db/db';
import { SCHEMA_VERSION, type Notebook } from '../src/db/schema';

let n = 0;
const freshName = () => `test-mig-${n++}`;

const notebook: Notebook = {
  id: 'nb1',
  title: '舊筆記',
  folderId: null,
  coverColor: '#1e88e5',
  template: 'blank',
  createdAt: 1,
  updatedAt: 1,
};

describe('migration', () => {
  it('migrations 的數量等於 SCHEMA_VERSION', () => {
    expect(migrations.length).toBe(SCHEMA_VERSION);
  });

  it('v1 資料經過（測試用的）v2 migration 後可以讀取', async () => {
    const name = freshName();
    const v1db = await openInkDb(name);
    await v1db.put('notebooks', notebook);
    v1db.close();

    // 假想 v2：替每本筆記本加上 pinned 欄位
    const v2 = vi.fn<Migration>(async (_db, tx) => {
      const store = tx.objectStore('notebooks');
      for (const nb of await store.getAll()) {
        await store.put({ ...nb, pinned: false } as Notebook);
      }
    });

    const v2db = await openInkDb(name, [...migrations, v2]);
    expect(v2db.version).toBe(2);
    expect(await v2db.get('notebooks', 'nb1')).toEqual({ ...notebook, pinned: false });
    expect(await v2db.get('meta', 'schemaVersion')).toEqual({ key: 'schemaVersion', value: 2 });
    v2db.close();

    // 再次開啟不會重跑 migration
    const again = await openInkDb(name, [...migrations, v2]);
    expect(v2).toHaveBeenCalledTimes(1);
    again.close();
  });

  it('全新的 DB 會依序執行所有 migration', async () => {
    const order: number[] = [];
    const list: Migration[] = [
      (db, tx) => {
        order.push(1);
        return migrations[0](db, tx);
      },
      () => {
        order.push(2);
      },
    ];
    const db = await openInkDb(freshName(), list);
    expect(order).toEqual([1, 2]);
    expect(db.version).toBe(2);
    db.close();
  });
});
