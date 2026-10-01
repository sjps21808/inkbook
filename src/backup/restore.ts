import { deleteDB } from 'idb';
import { migrations as allMigrations, openInkDb, type InkDatabase, type Migration } from '../db/db';
import { newId } from '../db/repo';
import type { BlobRecord, Folder, Notebook, Page, PageElement } from '../db/schema';
import type { ParsedBackup } from './backup';

export type RestoreMode = 'merge' | 'overwrite';

interface Records {
  folders: Folder[];
  notebooks: Notebook[];
  pages: Page[];
  elements: PageElement[];
  blobs: BlobRecord[];
}

const STORES = ['folders', 'notebooks', 'pages', 'elements', 'blobs'] as const;

function toRecords({ data, blobs }: ParsedBackup): Records {
  return {
    folders: data.folders,
    notebooks: data.notebooks,
    pages: data.pages,
    elements: data.elements,
    blobs: data.blobs.map(({ id, mime }) => ({ id, mime, data: new Blob([blobs.get(id)! as Uint8Array<ArrayBuffer>], { type: mime }) })),
  };
}

async function writeAll(db: InkDatabase, r: Records): Promise<void> {
  const tx = db.transaction(STORES, 'readwrite');
  await Promise.all([...STORES.flatMap((s) => r[s].map((v) => tx.objectStore(s).put(v as never))), tx.done]);
}

/**
 * 舊版本的備份：先寫進與備份同版本的暫存 DB，再用正式的 migration 升級後讀出來，
 * 這樣還原與 App 升級走的是同一套 migration。
 */
async function migrate(records: Records, fromVersion: number, list: Migration[]): Promise<Records> {
  if (fromVersion === list.length) return records;
  const name = `inkbook-restore-${newId()}`;
  try {
    const old = await openInkDb(name, list.slice(0, fromVersion));
    await writeAll(old, records);
    old.close();
    const db = await openInkDb(name, list);
    const tx = db.transaction(STORES);
    const [folders, notebooks, pages, elements, blobs] = await Promise.all(STORES.map((s) => tx.objectStore(s).getAll()));
    await tx.done;
    db.close();
    return { folders, notebooks, pages, elements, blobs } as Records;
  } finally {
    await deleteDB(name);
  }
}

/**
 * 還原備份。meta（schemaVersion、lastBackupAt）一律保留本機的值。
 * - overwrite：清空本機的資料夾、筆記本、頁面、element、blob 後寫入備份
 * - merge：保留本機資料；備份裡的筆記本如果本機也有（相同 id），整本換成備份的版本
 */
export async function restoreBackup(
  db: InkDatabase,
  backup: ParsedBackup,
  mode: RestoreMode,
  list: Migration[] = allMigrations,
): Promise<void> {
  const r = await migrate(toRecords(backup), backup.data.schemaVersion, list);

  const tx = db.transaction(STORES, 'readwrite');
  const run = async () => {
    if (mode === 'overwrite') {
      await Promise.all(STORES.map((s) => tx.objectStore(s).clear()));
    } else {
      // 避免同一本筆記本混到兩邊的頁面
      for (const nb of r.notebooks) {
        const pageIds = await tx.objectStore('pages').index('notebookId').getAllKeys(nb.id);
        for (const pageId of pageIds) {
          const elIds = await tx.objectStore('elements').index('pageId').getAllKeys(pageId);
          await Promise.all(elIds.map((id) => tx.objectStore('elements').delete(id)));
          await tx.objectStore('pages').delete(pageId);
        }
      }
    }
    await Promise.all(STORES.flatMap((s) => r[s].map((v) => tx.objectStore(s).put(v as never))));
  };
  await Promise.all([run(), tx.done]);
}
