import type { InkDatabase } from '../db/db';
import { importPdfAction } from '../pdf/importPdf';

export interface LibraryContext {
  db: InkDatabase;
  /** 重新讀取書架 */
  refresh(): void;
  openNotebook(id: string): void;
}

export interface LibraryAction {
  id: string;
  label: string;
  run(ctx: LibraryContext): void | Promise<void>;
}

/** 書架頂端的動作列；並行開發時只能在陣列尾端新增項目（CLAUDE.md §6） */
export const actions: LibraryAction[] = [
  { id: 'import-pdf', label: '匯入 PDF', run: importPdfAction },
];
