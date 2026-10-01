import { openDB, type IDBPDatabase } from 'idb';
import { SCHEMA_VERSION, type InkDB } from './schema';

export type InkDatabase = IDBPDatabase<InkDB>;

export function openInkDb(name = 'inkbook'): Promise<InkDatabase> {
  return openDB<InkDB>(name, SCHEMA_VERSION, {
    upgrade(db, _oldVersion, _newVersion, tx) {
      db.createObjectStore('folders', { keyPath: 'id' }).createIndex('parentId', 'parentId');
      db.createObjectStore('notebooks', { keyPath: 'id' }).createIndex('folderId', 'folderId');
      db.createObjectStore('pages', { keyPath: 'id' }).createIndex('notebookId', 'notebookId');
      db.createObjectStore('elements', { keyPath: 'id' }).createIndex('pageId', 'pageId');
      db.createObjectStore('blobs', { keyPath: 'id' });
      db.createObjectStore('meta', { keyPath: 'key' });
      void tx.objectStore('meta').put({ key: 'schemaVersion', value: SCHEMA_VERSION });
    },
  });
}
