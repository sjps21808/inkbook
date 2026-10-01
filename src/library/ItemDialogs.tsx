import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { InkDatabase } from '../db/db';
import {
  deleteFolder,
  deleteNotebook,
  folderContents,
  folderSubtree,
  moveFolder,
  moveNotebook,
  renameFolder,
  renameNotebook,
} from '../db/repo';
import type { Folder } from '../db/schema';

export interface Item {
  type: 'folder' | 'notebook';
  id: string;
  name: string;
  /** 目前所在的資料夾 */
  parentId: string | null;
}

export type ItemAction = 'rename' | 'move' | 'delete';

export function Dialog({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="dialog-backdrop">
      <div class="dialog" role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

/** 「⋯」按鈕與它的選單 */
export function ItemMenu({ item, onPick }: { item: Item; onPick(action: ItemAction): void }) {
  const [open, setOpen] = useState(false);
  const pick = (a: ItemAction) => {
    setOpen(false);
    onPick(a);
  };
  return (
    <div class="item-menu">
      <button class="more" aria-label={`${item.name} 選項`} aria-expanded={open} onClick={() => setOpen(!open)}>
        ⋯
      </button>
      {open && (
        <div class="menu" role="menu">
          <button role="menuitem" onClick={() => pick('rename')}>
            重新命名
          </button>
          <button role="menuitem" onClick={() => pick('move')}>
            移動
          </button>
          <button role="menuitem" class="danger" onClick={() => pick('delete')}>
            刪除
          </button>
        </div>
      )}
    </div>
  );
}

interface DialogProps {
  db: InkDatabase;
  item: Item;
  action: ItemAction;
  folders: Folder[];
  onDone(): void;
  onCancel(): void;
}

export function ItemDialog(props: DialogProps) {
  if (props.action === 'rename') return <RenameDialog {...props} />;
  if (props.action === 'move') return <MoveDialog {...props} />;
  return <DeleteDialog {...props} />;
}

function RenameDialog({ db, item, onDone, onCancel }: DialogProps) {
  const [name, setName] = useState(item.name);
  const submit = async (e: Event) => {
    e.preventDefault();
    const v = name.trim();
    if (!v) return;
    await (item.type === 'folder' ? renameFolder(db, item.id, v) : renameNotebook(db, item.id, v));
    onDone();
  };
  return (
    <Dialog label="重新命名">
      <form onSubmit={submit}>
        <h3>重新命名</h3>
        <input aria-label="新名稱" autoFocus value={name} onInput={(e) => setName(e.currentTarget.value)} />
        <div class="dialog-buttons">
          <button type="button" onClick={onCancel}>
            取消
          </button>
          <button type="submit" class="primary">
            確定
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function MoveDialog({ db, item, folders, onDone, onCancel }: DialogProps) {
  // 資料夾不能移到自己或子孫底下
  const excluded = item.type === 'folder' ? folderSubtree(folders, item.id) : new Set<string>();
  const move = async (to: string | null) => {
    await (item.type === 'folder' ? moveFolder(db, item.id, to) : moveNotebook(db, item.id, to));
    onDone();
  };
  const dest = (id: string | null, name: string) => (
    <button class="dest" disabled={id === item.parentId} onClick={() => void move(id)}>
      {name}
    </button>
  );
  const tree = (parentId: string | null) => {
    const children = folders.filter((f) => f.parentId === parentId && !excluded.has(f.id));
    if (children.length === 0) return null;
    return (
      <ul>
        {children.map((f) => (
          <li key={f.id}>
            {dest(f.id, f.name)}
            {tree(f.id)}
          </li>
        ))}
      </ul>
    );
  };
  return (
    <Dialog label="移動到">
      <h3>把「{item.name}」移動到</h3>
      <div class="dest-tree">
        {dest(null, '書架')}
        {tree(null)}
      </div>
      <div class="dialog-buttons">
        <button onClick={onCancel}>取消</button>
      </div>
    </Dialog>
  );
}

function DeleteDialog({ db, item, onDone, onCancel }: DialogProps) {
  const [counts, setCounts] = useState<{ folders: number; notebooks: number } | null>(null);
  useEffect(() => {
    if (item.type === 'folder') void folderContents(db, item.id).then(setCounts);
  }, [db, item]);

  const remove = async () => {
    await (item.type === 'folder' ? deleteFolder(db, item.id) : deleteNotebook(db, item.id));
    onDone();
  };
  return (
    <Dialog label="確認刪除">
      <h3>刪除「{item.name}」？</h3>
      {item.type === 'folder' ? (
        counts && (
          <p>
            將刪除 {counts.folders} 個資料夾（含子資料夾）與 {counts.notebooks} 本筆記本。
          </p>
        )
      ) : (
        <p>這本筆記本的所有頁面都會被刪除。</p>
      )}
      <p class="warn">此動作無法復原。</p>
      <div class="dialog-buttons">
        <button onClick={onCancel}>取消</button>
        <button class="danger" onClick={() => void remove()}>
          刪除
        </button>
      </div>
    </Dialog>
  );
}
