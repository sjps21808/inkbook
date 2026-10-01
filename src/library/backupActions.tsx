import { useState } from 'preact/hooks';
import { BackupError, exportBackup, parseBackup, type ParsedBackup } from '../backup/backup';
import { restoreBackup, type RestoreMode } from '../backup/restore';
import type { InkDatabase } from '../db/db';
import type { LibraryContext } from './actions';
import { Dialog } from './ItemDialogs';
import { showOverlay } from './overlay';

const pad = (n: number) => String(n).padStart(2, '0');

export const backupFileName = (d: Date) =>
  `inkbook-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.inkbak`;

export async function getLastBackupAt(db: InkDatabase): Promise<number | null> {
  return (await db.get('meta', 'lastBackupAt'))?.value ?? null;
}

export const BACKUP_REMINDER_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

/** 要不要顯示備份提示：從未備份且有筆記本，或距離上次備份超過 7 天 */
export function needsBackupReminder(lastBackupAt: number | null, notebookCount: number, now = Date.now()): boolean {
  if (lastBackupAt === null) return notebookCount > 0;
  return now - lastBackupAt > BACKUP_REMINDER_DAYS * DAY;
}

/** 距離上次備份的天數（無條件捨去） */
export const daysSince = (t: number, now = Date.now()) => Math.floor((now - t) / DAY);

export const markBackedUp = (db: InkDatabase, at = Date.now()) => db.put('meta', { key: 'lastBackupAt', value: at });

/** 用分享面板儲存檔案，不支援時改用下載；使用者取消時回傳 false */
export async function shareOrDownload(file: File): Promise<boolean> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false;
      // 其他錯誤（例如不允許分享）改用下載
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

const formatSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function Message({ title, text, close }: { title: string; text: string; close(): void }) {
  return (
    <Dialog label={title}>
      <h3>{title}</h3>
      <p>{text}</p>
      <div class="dialog-buttons">
        <button class="primary" onClick={close}>
          好
        </button>
      </div>
    </Dialog>
  );
}

/**
 * 備份：先打包，再讓使用者點一次按鈕才分享。
 * Safari 的 navigator.share 必須在使用者手勢當下呼叫，打包要讀 IndexedDB，等太久會失效。
 */
export async function runBackup(ctx: LibraryContext): Promise<void> {
  const bytes = await exportBackup(ctx.db);
  const file = new File([bytes as Uint8Array<ArrayBuffer>], backupFileName(new Date()), {
    type: 'application/octet-stream',
  });
  showOverlay((close) => (
    <Dialog label="備份">
      <h3>備份檔已準備好</h3>
      <p>
        {file.name}（{formatSize(file.size)}）
      </p>
      <p>請把備份檔存到「檔案」App 或其他地方保存。</p>
      <div class="dialog-buttons">
        <button onClick={close}>取消</button>
        <button
          class="primary"
          onClick={async () => {
            if (!(await shareOrDownload(file))) return;
            await markBackedUp(ctx.db);
            close();
            ctx.refresh();
          }}
        >
          分享／儲存
        </button>
      </div>
    </Dialog>
  ));
}

function RestoreDialog({ ctx, backup, close }: { ctx: LibraryContext; backup: ParsedBackup; close(): void }) {
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const restore = async (mode: RestoreMode) => {
    setBusy(true);
    await restoreBackup(ctx.db, backup, mode);
    setDone(true);
    ctx.refresh();
  };

  if (done) return <Message title="還原完成" text={`已還原 ${backup.data.notebooks.length} 本筆記本。`} close={close} />;

  const time = new Date(backup.data.exportedAt).toLocaleString('zh-TW');
  return (
    <Dialog label="還原備份">
      <h3>還原備份</h3>
      <p>
        備份時間：{time}，共 {backup.data.notebooks.length} 本筆記本、{backup.data.folders.length} 個資料夾。
      </p>
      {confirmOverwrite ? (
        <>
          <p class="warn">覆蓋會先刪除這台 iPad 上所有的筆記，此動作無法復原。確定要覆蓋嗎？</p>
          <div class="dialog-buttons">
            <button onClick={() => setConfirmOverwrite(false)}>返回</button>
            <button class="danger" disabled={busy} onClick={() => void restore('overwrite')}>
              確定覆蓋
            </button>
          </div>
        </>
      ) : (
        <>
          <p>合併：保留目前的筆記，加入備份裡的筆記（同一本筆記本會換成備份的版本）。</p>
          <p>覆蓋：刪除目前所有筆記，換成備份的內容。</p>
          <div class="dialog-buttons">
            <button onClick={close}>取消</button>
            <button onClick={() => setConfirmOverwrite(true)}>覆蓋</button>
            <button class="primary" disabled={busy} onClick={() => void restore('merge')}>
              合併
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}

/** 還原：選擇 .inkbak 檔。必須同步呼叫 input.click()，才算在使用者手勢內 */
export function runRestore(ctx: LibraryContext): void {
  const input = document.createElement('input');
  input.type = 'file';
  // 不設定 accept：iOS 對自訂副檔名的支援不穩定，可能讓檔案無法選取；改為讀取後檢查內容
  input.hidden = true;
  document.body.appendChild(input);
  input.addEventListener('cancel', () => input.remove());
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    input.remove();
    if (!f) return;
    let backup: ParsedBackup;
    try {
      backup = parseBackup(new Uint8Array(await f.arrayBuffer()));
    } catch (e) {
      const text = e instanceof BackupError ? e.message : '無法讀取這個檔案';
      showOverlay((close) => <Message title="無法還原" text={text} close={close} />);
      return;
    }
    showOverlay((close) => <RestoreDialog ctx={ctx} backup={backup} close={close} />);
  });
  input.click();
}
