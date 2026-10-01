import type { InkDatabase } from '../db/db';
import { createPdfNotebook } from '../db/repo';
import type { LibraryContext } from '../library/actions';
import { openPdf, pageSizes } from './pdfjs';

export const MAX_PDF_PAGES = 500;
export const MAX_PDF_BYTES = 100 * 1024 * 1024;

export const TOO_LARGE = `PDF 檔案超過 ${MAX_PDF_BYTES / 1024 / 1024}MB，無法匯入`;
export const TOO_MANY_PAGES = `PDF 超過 ${MAX_PDF_PAGES} 頁，無法匯入`;
export const UNREADABLE = '無法讀取這個 PDF（檔案可能損壞或不是 PDF）';
export const ENCRYPTED = '不支援有密碼保護的 PDF';
export const SAVE_FAILED = '無法儲存 PDF（儲存空間可能不足）';

/** 檔名去掉 .pdf 當作筆記本標題 */
export const titleFromName = (name: string) => name.replace(/\.pdf$/i, '').trim() || '未命名 PDF';

export type ImportResult = { ok: true; notebookId: string } | { ok: false; message: string };

export async function importPdf(db: InkDatabase, file: File): Promise<ImportResult> {
  if (file.size > MAX_PDF_BYTES) return { ok: false, message: TOO_LARGE };
  let doc;
  try {
    doc = await openPdf(await file.arrayBuffer());
  } catch (e) {
    return { ok: false, message: (e as Error)?.name === 'PasswordException' ? ENCRYPTED : UNREADABLE };
  }
  try {
    if (doc.numPages > MAX_PDF_PAGES) return { ok: false, message: TOO_MANY_PAGES };
    const sizes = await pageSizes(doc);
    try {
      const { notebook } = await createPdfNotebook(db, { title: titleFromName(file.name), data: file, sizes });
      return { ok: true, notebookId: notebook.id };
    } catch {
      return { ok: false, message: SAVE_FAILED };
    }
  } finally {
    void doc.loadingTask.destroy();
  }
}

/** 書架動作：選檔 → 匯入 → 開啟；必須在點擊事件中同步呼叫（iOS 才會開啟檔案選擇器） */
export function importPdfAction(ctx: LibraryContext): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/pdf,.pdf';
  input.hidden = true;
  const done = () => input.remove();
  input.addEventListener('cancel', done);
  input.addEventListener('change', async () => {
    done();
    const file = input.files?.[0];
    if (!file) return;
    const r = await importPdf(ctx.db, file);
    if (r.ok) ctx.openNotebook(r.notebookId);
    else alert(r.message);
  });
  document.body.append(input);
  input.click();
}
