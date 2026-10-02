import { useEffect, useState } from 'preact/hooks';
import type { InkDatabase } from '../db/db';
import type { Notebook } from '../db/schema';
import { formatSize, shareOrDownload } from '../library/backupActions';
import { Dialog } from '../library/ItemDialogs';
import { showOverlay } from '../library/overlay';

/** 檔名：去掉檔案系統不允許的字元 */
export const pdfFileName = (title: string) => `${title.replace(/[\\/:*?"<>|]/g, '_').trim() || '筆記'}.pdf`;

type State = { kind: 'working'; done: number; total: number } | { kind: 'ready'; file: File } | { kind: 'error' };

function ExportDialog({ db, notebook, close }: { db: InkDatabase; notebook: Notebook; close(): void }) {
  const [state, setState] = useState<State>({ kind: 'working', done: 0, total: 0 });

  useEffect(() => {
    // pdf-lib 與 fontkit 只在匯出時才載入（不拖慢啟動）
    import('./exportPdf')
      .then(({ exportNotebookPdf }) =>
        exportNotebookPdf(db, notebook.id, { onProgress: (done, total) => setState({ kind: 'working', done, total }) }),
      )
      .then((bytes) => {
        const file = new File([bytes as Uint8Array<ArrayBuffer>], pdfFileName(notebook.title), {
          type: 'application/pdf',
        });
        setState({ kind: 'ready', file });
      })
      .catch((e) => {
        console.error(e);
        setState({ kind: 'error' });
      });
  }, []);

  if (state.kind === 'working') {
    return (
      <Dialog label="匯出 PDF">
        <h3>正在匯出 PDF…</h3>
        <progress max={state.total || 1} value={state.done} />
        <p>
          {state.done} / {state.total || '–'} 頁
        </p>
      </Dialog>
    );
  }
  if (state.kind === 'error') {
    return (
      <Dialog label="匯出 PDF">
        <h3>匯出失敗</h3>
        <p>無法產生 PDF，請再試一次。</p>
        <div class="dialog-buttons">
          <button class="primary" onClick={close}>
            好
          </button>
        </div>
      </Dialog>
    );
  }
  // Safari 的 navigator.share 必須在使用者手勢當下呼叫，所以產生完再讓使用者點一次
  return (
    <Dialog label="匯出 PDF">
      <h3>PDF 已準備好</h3>
      <p>
        {state.file.name}（{formatSize(state.file.size)}）
      </p>
      <div class="dialog-buttons">
        <button onClick={close}>取消</button>
        <button
          class="primary"
          onClick={async () => {
            if (await shareOrDownload(state.file)) close();
          }}
        >
          分享／儲存
        </button>
      </div>
    </Dialog>
  );
}

export function runExport(db: InkDatabase, notebook: Notebook): void {
  showOverlay((close) => <ExportDialog db={db} notebook={notebook} close={close} />);
}
