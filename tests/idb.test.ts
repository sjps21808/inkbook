import { describe, expect, it } from 'vitest';
import { openDB } from 'idb';

describe('fake-indexeddb', () => {
  it('可以寫入並讀回資料', async () => {
    const db = await openDB('smoke', 1, {
      upgrade(db) {
        db.createObjectStore('kv');
      },
    });
    await db.put('kv', { a: 1 }, 'k');
    expect(await db.get('kv', 'k')).toEqual({ a: 1 });
    db.close();
  });
});
