import { openDB, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb';
import type { InkDB } from './schema';

export type InkDatabase = IDBPDatabase<InkDB>;
export type UpgradeTx = IDBPTransaction<InkDB, StoreNames<InkDB>[], 'versionchange'>;

/** migrations[i] 把資料從版本 i 升級到 i + 1；陣列長度就是最新的 schema 版本 */
export type Migration = (db: InkDatabase, tx: UpgradeTx) => Promise<void> | void;

const v1: Migration = (db) => {
  db.createObjectStore('folders', { keyPath: 'id' }).createIndex('parentId', 'parentId');
  db.createObjectStore('notebooks', { keyPath: 'id' }).createIndex('folderId', 'folderId');
  db.createObjectStore('pages', { keyPath: 'id' }).createIndex('notebookId', 'notebookId');
  db.createObjectStore('elements', { keyPath: 'id' }).createIndex('pageId', 'pageId');
  db.createObjectStore('blobs', { keyPath: 'id' });
  db.createObjectStore('meta', { keyPath: 'key' });
};

export const migrations: Migration[] = [v1];

export function openInkDb(name = 'inkbook', list: Migration[] = migrations): Promise<InkDatabase> {
  const target = list.length;
  return openDB<InkDB>(name, target, {
    // 只能 await IndexedDB 的請求，否則 versionchange 交易會提前結束
    async upgrade(db, oldVersion, _newVersion, tx) {
      for (let v = oldVersion; v < target; v++) await list[v](db, tx);
      await tx.objectStore('meta').put({ key: 'schemaVersion', value: target });
    },
  });
}

