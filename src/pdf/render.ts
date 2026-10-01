import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { InkDatabase } from '../db/db';
import { getBlob } from '../db/repo';
import type { Page } from '../db/schema';
import { pdfFit } from './fit';
import { openPdf } from './pdfjs';

export type PdfRef = NonNullable<Page['pdf']>;

export interface RenderJob {
  cancel(): void;
  /** 畫完（或取消、失敗）時 resolve */
  done: Promise<void>;
}

/** 一本筆記本開啟中的 PDF：每個 blob 只開一次，關閉筆記本時釋放 */
export class PdfDocs {
  private docs = new Map<string, Promise<PDFDocumentProxy>>();

  constructor(private db: InkDatabase) {}

  private open(blobId: string): Promise<PDFDocumentProxy> {
    let doc = this.docs.get(blobId);
    if (!doc) {
      doc = getBlob(this.db, blobId).then(async (rec) => openPdf(await rec!.data.arrayBuffer()));
      this.docs.set(blobId, doc);
      doc.catch(() => this.docs.delete(blobId));
    }
    return doc;
  }

  /** 把 PDF 頁畫到 canvas（scale = canvas 像素 / pt）；呼叫前 canvas 應已塗白 */
  render(canvas: HTMLCanvasElement, pdf: PdfRef, scale: number): RenderJob {
    let cancelled = false;
    let cancelTask = () => {};
    const done = (async () => {
      const doc = await this.open(pdf.blobId);
      if (cancelled) return;
      const page = await doc.getPage(pdf.pageNo);
      if (cancelled) return;
      const box = pdfFit(pdf.srcWidth, pdf.srcHeight);
      const viewport = page.getViewport({ scale: (box.w / pdf.srcWidth) * scale });
      const task = page.render({
        canvas,
        viewport,
        transform: [1, 0, 0, 1, box.x * scale, box.y * scale],
      });
      cancelTask = () => task.cancel();
      await task.promise;
      page.cleanup();
    })().catch(() => {
      // 取消（RenderingCancelledException）或 PDF 損壞：保留白紙
    });
    return {
      cancel() {
        cancelled = true;
        cancelTask();
      },
      done,
    };
  }

  /** 關閉所有 PDF，釋放 worker 與記憶體 */
  destroy(): void {
    for (const doc of this.docs.values()) void doc.then((d) => d.loadingTask.destroy(), () => {});
    this.docs.clear();
  }
}
