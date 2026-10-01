import { useEffect, useState } from 'preact/hooks';
import type { InkDatabase } from '../db/db';
import { createFolder, createNotebook, listFolders, listNotebooks } from '../db/repo';
import type { Folder, Notebook } from '../db/schema';
import { actions, type LibraryContext } from './actions';
import { ItemDialog, ItemMenu, type Item, type ItemAction } from './ItemDialogs';

interface Props {
  db: InkDatabase;
  onOpen(id: string): void;
}

const formatTime = (t: number) =>
  new Date(t).toLocaleString('zh-TW', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const folderItem = (f: Folder): Item => ({ type: 'folder', id: f.id, name: f.name, parentId: f.parentId });
const notebookItem = (nb: Notebook): Item => ({ type: 'notebook', id: nb.id, name: nb.title, parentId: nb.folderId });

// 從筆記本返回書架時，停留在原本的資料夾
let lastFolderId: string | null = null;

export function Library({ db, onOpen }: Props) {
  const [notebooks, setNotebooks] = useState<Notebook[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderIdState] = useState<string | null>(lastFolderId);
  const [creating, setCreating] = useState<'notebook' | 'folder' | null>(null);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ item: Item; action: ItemAction } | null>(null);

  const setFolderId = (id: string | null) => {
    lastFolderId = id;
    setFolderIdState(id);
  };

  const refresh = () => {
    void listNotebooks(db).then((nbs) => setNotebooks(nbs.sort((a, b) => b.updatedAt - a.updatedAt)));
    void listFolders(db).then((fs) => {
      setFolders(fs.sort((a, b) => a.createdAt - b.createdAt));
      // 目前的資料夾被刪除（或還原後不存在）時回到根目錄
      if (lastFolderId !== null && !fs.some((f) => f.id === lastFolderId)) setFolderId(null);
    });
  };
  useEffect(refresh, [db]);

  const ctx: LibraryContext = { db, refresh, openNotebook: onOpen };

  const startCreate = (kind: 'notebook' | 'folder') => {
    setName('');
    setCreating(kind);
  };

  const create = async (e: Event) => {
    e.preventDefault();
    if (creating === 'notebook') {
      const { notebook } = await createNotebook(db, { title: name.trim() || '未命名筆記本', folderId });
      onOpen(notebook.id);
    } else {
      const folder = await createFolder(db, name.trim() || '未命名資料夾', folderId);
      setCreating(null);
      setFolderId(folder.id);
      refresh();
    }
  };

  const current = folders.find((f) => f.id === folderId);
  const shown = notebooks?.filter((nb) => nb.folderId === folderId);
  const label = creating === 'folder' ? '資料夾名稱' : '筆記本標題';

  const renderTree = (parentId: string | null) => {
    const children = folders.filter((f) => f.parentId === parentId);
    if (children.length === 0) return null;
    return (
      <ul>
        {children.map((f) => (
          <li key={f.id}>
            <button
              class="folder-node"
              aria-current={f.id === folderId ? 'true' : undefined}
              onClick={() => setFolderId(f.id)}
            >
              {f.name}
            </button>
            <ItemMenu item={folderItem(f)} onPick={(action) => setEditing({ item: folderItem(f), action })} />
            {renderTree(f.id)}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div class="library">
      <nav class="folder-tree" aria-label="資料夾">
        <button
          class="folder-node"
          aria-current={folderId === null ? 'true' : undefined}
          onClick={() => setFolderId(null)}
        >
          書架
        </button>
        {renderTree(null)}
      </nav>
      <section class="library-main">
        <div class="library-actions">
          <button onClick={() => startCreate('notebook')}>新增筆記本</button>
          <button onClick={() => startCreate('folder')}>新增資料夾</button>
          {actions.map((a) => (
            <button key={a.id} onClick={() => void a.run(ctx)}>
              {a.label}
            </button>
          ))}
        </div>
        {creating && (
          <form class="new-notebook" onSubmit={create}>
            <input
              aria-label={label}
              placeholder={label}
              autoFocus
              value={name}
              onInput={(e) => setName(e.currentTarget.value)}
            />
            <button type="submit">建立</button>
            <button type="button" onClick={() => setCreating(null)}>
              取消
            </button>
          </form>
        )}
        <h2 class="folder-title">{current?.name ?? '書架'}</h2>
        {shown?.length === 0 && <p class="empty">還沒有筆記本</p>}
        <ul class="notebook-grid">
          {shown?.map((nb) => (
            <li key={nb.id} class="notebook-item">
              <button class="notebook-card" onClick={() => onOpen(nb.id)}>
                <span class="cover" style={{ background: nb.coverColor }} />
                <span class="title">{nb.title}</span>
                <span class="time">{formatTime(nb.updatedAt)}</span>
              </button>
              <ItemMenu item={notebookItem(nb)} onPick={(action) => setEditing({ item: notebookItem(nb), action })} />
            </li>
          ))}
        </ul>
      </section>
      {editing && (
        <ItemDialog
          db={db}
          item={editing.item}
          action={editing.action}
          folders={folders}
          onCancel={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
