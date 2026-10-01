// pdf.js 只在需要時才載入（不拖慢啟動）；worker 與資源都從同源的固定路徑取得，可離線
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfPageSize } from '../db/repo';

const asset = (path: string) => new URL(`${import.meta.env.BASE_URL}${path}`, location.href).href;

let lib: Promise<typeof import('pdfjs-dist')> | null = null;

function load() {
  lib ??= import('pdfjs-dist').then((m) => {
    m.GlobalWorkerOptions.workerSrc = asset('pdf.worker.min.mjs');
    return m;
  });
  return lib;
}

/** 開啟 PDF；data 會轉移給 worker，呼叫後不可再使用 */
export async function openPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const { getDocument } = await load();
  return getDocument({
    data: new Uint8Array(data),
    cMapUrl: asset('pdfjs/cmaps/'),
    standardFontDataUrl: asset('pdfjs/standard_fonts/'),
    wasmUrl: asset('pdfjs/wasm/'),
    iccUrl: asset('pdfjs/iccs/'),
    enableXfa: false,
  }).promise;
}

/** 每頁的顯示尺寸（pt，已套用頁面旋轉） */
export async function pageSizes(doc: PDFDocumentProxy): Promise<PdfPageSize[]> {
  return Promise.all(
    Array.from({ length: doc.numPages }, async (_, i) => {
      const vp = (await doc.getPage(i + 1)).getViewport({ scale: 1 });
      return { width: vp.width, height: vp.height };
    }),
  );
}
