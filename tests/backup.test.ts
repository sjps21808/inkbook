// @vitest-environment node
// jsdom 的 Blob 無法被 fake-indexeddb 的 structuredClone 複製，所以用 Node 環境
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { BackupError, decodeData, encodeData, exportBackup, parseBackup, type BackupData } from '../src/backup/backup';
import { restoreBackup } from '../src/backup/restore';
import { migrations, openInkDb, type Migration } from '../src/db/db';
import { addPage, createFolder, createNotebook, listFolders, listNotebooks, listPages, putElements } from '../src/db/repo';
import { SCHEMA_VERSION, type Notebook, type StrokeElement } from '../src/db/schema';

let n = 0;
const open = () => openInkDb(`test-backup-${n++}`);

const pts = new Float32Array([10.5, 20.25, 0.5, 30, 40, 0.75, -1.125, 1e6, 0]);

async function seed() {
  const db = await open();
  const folder = await createFolder(db, '學校', null);
  const { notebook, page } = await createNotebook(db, { title: '數學', folderId: folder.id });
  const s: StrokeElement = {
    id: 's1',
    pageId: page.id,
    z: 0,
    type: 'stroke',
    tool: 'pen',
    color: '#1c1c1e',
    width: 3,
    points: pts,
  };
  await putElements(db, [s]);
  await db.put('blobs', { id: 'img1', data: new Blob([new Uint8Array([1, 2, 3, 255])], { type: 'image/png' }), mime: 'image/png' });
  return { db, folder, notebook, page };
}

describe('備份匯出', () => {
  it('Float32Array 編碼後解碼完全一致', () => {
    const data = { elements: [{ points: pts }] } as unknown as BackupData;
    const back = decodeData(encodeData(data)) as unknown as { elements: { points: Float32Array }[] };
    expect(back.elements[0].points).toBeInstanceOf(Float32Array);
    expect(Array.from(back.elements[0].points)).toEqual(Array.from(pts));
  });

  it('匯出後解析回來，內容與 schema 版本一致', async () => {
    const { db, folder, notebook, page } = await seed();
    const bytes = await exportBackup(db);
    const { data, blobs } = parseBackup(bytes);
    expect(data.format).toBe('inkbak');
    expect(data.schemaVersion).toBe(SCHEMA_VERSION);
    expect(data.folders).toEqual([folder]);
    expect(data.notebooks.map((x) => x.id)).toEqual([notebook.id]);
    expect(data.pages).toEqual([page]);
    expect(Array.from((data.elements[0] as StrokeElement).points)).toEqual(Array.from(pts));
    expect(data.blobs).toEqual([{ id: 'img1', mime: 'image/png' }]);
    expect(Array.from(blobs.get('img1')!)).toEqual([1, 2, 3, 255]);
    db.close();
  });

  it('不是 zip、缺少 db.json、版本比 App 新、缺少 blob 時拋出 BackupError', () => {
    const zip = (json: object, extra = {}) => zipSync({ 'db.json': strToU8(JSON.stringify(json)), ...extra });
    const base = { format: 'inkbak', schemaVersion: 1, exportedAt: 0, folders: [], notebooks: [], pages: [], elements: [], blobs: [] };
    expect(() => parseBackup(new Uint8Array([1, 2, 3]))).toThrow(BackupError);
    expect(() => parseBackup(zipSync({ 'x.txt': strToU8('x') }))).toThrow(BackupError);
    expect(() => parseBackup(zip({ ...base, format: 'other' }))).toThrow(BackupError);
    expect(() => parseBackup(zip({ ...base, schemaVersion: SCHEMA_VERSION + 1 }))).toThrow('較新版本');
    expect(() => parseBackup(zip({ ...base, blobs: [{ id: 'b', mime: 'x' }] }))).toThrow('不完整');
    expect(parseBackup(zip(base)).data.notebooks).toEqual([]);
  });
});

const dump = async (db: Awaited<ReturnType<typeof open>>) => ({
  folders: (await listFolders(db)).map((f) => f.name).sort(),
  notebooks: (await listNotebooks(db)).map((x) => x.title).sort(),
  pages: await db.count('pages'),
  elements: await db.count('elements'),
  blobs: await db.count('blobs'),
});

describe('備份還原', () => {
  it('覆蓋：清掉本機資料，內容與備份相同（含 Float32Array 與 blob）', async () => {
    const src = await seed();
    const backup = parseBackup(await exportBackup(src.db));
    const db = await open();
    await createNotebook(db, { title: '本機的筆記' });
    await db.put('meta', { key: 'lastBackupAt', value: 123 });

    await restoreBackup(db, backup, 'overwrite');
    expect(await dump(db)).toEqual({ folders: ['學校'], notebooks: ['數學'], pages: 1, elements: 1, blobs: 1 });
    const s = (await db.get('elements', 's1')) as StrokeElement;
    expect(Array.from(s.points)).toEqual(Array.from(pts));
    const blob = (await db.get('blobs', 'img1'))!;
    expect(blob.data.type).toBe('image/png');
    expect(Array.from(new Uint8Array(await blob.data.arrayBuffer()))).toEqual([1, 2, 3, 255]);
    // meta 保留本機的值
    expect(await db.get('meta', 'lastBackupAt')).toEqual({ key: 'lastBackupAt', value: 123 });
    src.db.close();
    db.close();
  });

  it('合併：保留本機資料；同一本筆記本整本換成備份的版本', async () => {
    const src = await seed();
    const backup = parseBackup(await exportBackup(src.db));
    // 備份之後在原本的 DB 加了一頁並改名，再合併回去
    await addPage(src.db, src.notebook.id, 1, 'grid');
    await src.db.put('notebooks', { ...src.notebook, title: '改過的數學' });
    await createNotebook(src.db, { title: '新的筆記' });

    await restoreBackup(src.db, backup, 'merge');
    expect(await dump(src.db)).toEqual({
      folders: ['學校'],
      notebooks: ['數學', '新的筆記'],
      pages: 2,
      elements: 1,
      blobs: 1,
    });
    expect((await listPages(src.db, src.notebook.id)).map((p) => p.id)).toEqual([src.page.id]);
    src.db.close();
  });

  it('舊版本的備份會先經過 migration 再寫入', async () => {
    const src = await seed();
    const backup = parseBackup(await exportBackup(src.db)); // schemaVersion 1
    src.db.close();

    // 假想 v2：替每本筆記本加上 pinned 欄位
    const v2: Migration = async (_db, tx) => {
      const store = tx.objectStore('notebooks');
      for (const nb of await store.getAll()) await store.put({ ...nb, pinned: false } as Notebook);
    };
    const list = [...migrations, v2];
    const db = await openInkDb(`test-backup-${n++}`, list);
    await restoreBackup(db, backup, 'overwrite', list);

    expect(await listNotebooks(db)).toEqual([{ ...backup.data.notebooks[0], pinned: false }]);
    const s = (await db.get('elements', 's1')) as StrokeElement;
    expect(Array.from(s.points)).toEqual(Array.from(pts));
    // 暫存 DB 已刪除
    const names = (await indexedDB.databases()).map((d) => d.name);
    expect(names.some((x) => x?.startsWith('inkbook-restore-'))).toBe(false);
    db.close();
  });
});
