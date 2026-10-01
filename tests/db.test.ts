import { describe, expect, it } from 'vitest';
import { openInkDb } from '../src/db/db';
import { SCHEMA_VERSION } from '../src/db/schema';

let n = 0;
const freshName = () => `test-db-${n++}`;

describe('openInkDb', () => {
  it('建立完整的 store 與索引', async () => {
    const db = await openInkDb(freshName());
    expect([...db.objectStoreNames].sort()).toEqual(
      ['blobs', 'elements', 'folders', 'meta', 'notebooks', 'pages'].sort(),
    );
    const tx = db.transaction(['folders', 'notebooks', 'pages', 'elements']);
    expect([...tx.objectStore('folders').indexNames]).toEqual(['parentId']);
    expect([...tx.objectStore('notebooks').indexNames]).toEqual(['folderId']);
    expect([...tx.objectStore('pages').indexNames]).toEqual(['notebookId']);
    expect([...tx.objectStore('elements').indexNames]).toEqual(['pageId']);
    db.close();
  });

  it('schemaVersion = 1', async () => {
    const db = await openInkDb(freshName());
    expect(SCHEMA_VERSION).toBe(1);
    expect(await db.get('meta', 'schemaVersion')).toEqual({ key: 'schemaVersion', value: 1 });
    expect(db.version).toBe(1);
    db.close();
  });
});
