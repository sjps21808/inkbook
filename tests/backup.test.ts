// @vitest-environment node
// jsdom 的 Blob 無法被 fake-indexeddb 的 structuredClone 複製，所以用 Node 環境
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { BackupError, decodeData, encodeData, exportBackup, parseBackup, type BackupData } from '../src/backup/backup';
import { openInkDb } from '../src/db/db';
import { createFolder, createNotebook, putElements } from '../src/db/repo';
import { SCHEMA_VERSION, type StrokeElement } from '../src/db/schema';

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
