// 資料模型 schema v1（CLAUDE.md §11）。座標一律使用 A4 PDF 單位 595×842 pt。
import type { DBSchema } from 'idb';

export const SCHEMA_VERSION = 1;
export const PAGE_WIDTH = 595;
export const PAGE_HEIGHT = 842;

export type Template = 'blank' | 'lined' | 'grid' | 'dot';

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
}

export interface Notebook {
  id: string;
  title: string;
  folderId: string | null;
  coverColor: string;
  template: Template;
  createdAt: number;
  updatedAt: number;
}

export interface Page {
  id: string;
  notebookId: string;
  order: number;
  template: Template;
  pdf?: { blobId: string; pageNo: number; srcWidth: number; srcHeight: number };
}

interface ElementBase {
  id: string;
  pageId: string;
  z: number;
}

export interface StrokeElement extends ElementBase {
  type: 'stroke';
  tool: 'pen' | 'highlighter';
  color: string;
  width: number;
  /** x, y, pressure 交錯排列 */
  points: Float32Array;
}

export interface ImageElement extends ElementBase {
  type: 'image';
  blobId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}

export interface TextElement extends ElementBase {
  type: 'text';
  x: number;
  y: number;
  w: number;
  content: string;
  fontSize: number;
  color: string;
}

export type PageElement = StrokeElement | ImageElement | TextElement;

export interface BlobRecord {
  id: string;
  data: Blob;
  mime: string;
}

export interface Meta {
  key: 'schemaVersion' | 'lastBackupAt';
  value: number;
}

export interface InkDB extends DBSchema {
  folders: { key: string; value: Folder; indexes: { parentId: string } };
  notebooks: { key: string; value: Notebook; indexes: { folderId: string } };
  pages: { key: string; value: Page; indexes: { notebookId: string } };
  elements: { key: string; value: PageElement; indexes: { pageId: string } };
  blobs: { key: string; value: BlobRecord };
  meta: { key: Meta['key']; value: Meta };
}
