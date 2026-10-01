// 備份檔 .inkbak = zip(db.json + blobs/<id>)
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import type { InkDatabase } from '../db/db';
import { SCHEMA_VERSION, type Folder, type Notebook, type Page, type PageElement } from '../db/schema';

export const BACKUP_FORMAT = 'inkbak';

/** db.json 的內容；Float32Array 以 { $f32: base64 } 編碼 */
export interface BackupData {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: number;
  folders: Folder[];
  notebooks: Notebook[];
  pages: Page[];
  elements: PageElement[];
  blobs: { id: string; mime: string }[];
}

export interface ParsedBackup {
  data: BackupData;
  /** blob id → 內容 */
  blobs: Map<string, Uint8Array>;
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// IndexedDB 讀回的 typed array 可能屬於另一個 realm，不能用 instanceof
const isF32 = (v: unknown) => Object.prototype.toString.call(v) === '[object Float32Array]';

export function encodeData(data: BackupData): string {
  return JSON.stringify(data, (_k, v: unknown) => {
    if (!isF32(v)) return v;
    const f = v as Float32Array;
    return { $f32: toBase64(new Uint8Array(f.buffer, f.byteOffset, f.byteLength)) };
  });
}

export function decodeData(json: string): BackupData {
  return JSON.parse(json, (_k, v: unknown) => {
    if (v && typeof v === 'object' && typeof (v as { $f32?: unknown }).$f32 === 'string') {
      return new Float32Array(fromBase64((v as { $f32: string }).$f32).buffer);
    }
    return v;
  }) as BackupData;
}

/** 讀取整個資料庫並打包成 .inkbak */
export async function exportBackup(db: InkDatabase): Promise<Uint8Array> {
  const tx = db.transaction(['folders', 'notebooks', 'pages', 'elements', 'blobs']);
  const [folders, notebooks, pages, elements, blobRecords] = await Promise.all([
    tx.objectStore('folders').getAll(),
    tx.objectStore('notebooks').getAll(),
    tx.objectStore('pages').getAll(),
    tx.objectStore('elements').getAll(),
    tx.objectStore('blobs').getAll(),
  ]);
  await tx.done;

  const data: BackupData = {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    folders,
    notebooks,
    pages,
    elements,
    blobs: blobRecords.map((b) => ({ id: b.id, mime: b.mime })),
  };
  const files: Zippable = { 'db.json': strToU8(encodeData(data)) };
  for (const b of blobRecords) {
    // 圖片和 PDF 本身已經壓縮過，不再壓縮以節省時間
    files[`blobs/${b.id}`] = [new Uint8Array(await b.data.arrayBuffer()), { level: 0 }];
  }
  return zipSync(files);
}

export class BackupError extends Error {}

/** 解析 .inkbak；格式不對或版本比 App 新時拋出 BackupError */
export function parseBackup(bytes: Uint8Array): ParsedBackup {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new BackupError('不是有效的 InkBook 備份檔');
  }
  const json = files['db.json'];
  if (!json) throw new BackupError('不是有效的 InkBook 備份檔');
  let data: BackupData;
  try {
    data = decodeData(strFromU8(json));
  } catch {
    throw new BackupError('備份檔已損毀');
  }
  if (data.format !== BACKUP_FORMAT || !Number.isInteger(data.schemaVersion) || data.schemaVersion < 1) {
    throw new BackupError('不是有效的 InkBook 備份檔');
  }
  if (data.schemaVersion > SCHEMA_VERSION) {
    throw new BackupError('這個備份來自較新版本的 InkBook，請先更新 App 再還原');
  }
  const blobs = new Map<string, Uint8Array>();
  for (const { id } of data.blobs) {
    const b = files[`blobs/${id}`];
    if (!b) throw new BackupError('備份檔不完整');
    blobs.set(id, b);
  }
  return { data, blobs };
}
