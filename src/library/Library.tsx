import { useEffect, useState } from 'preact/hooks';
import type { InkDatabase } from '../db/db';
import { createNotebook, listNotebooks } from '../db/repo';
import type { Notebook } from '../db/schema';
import { actions, type LibraryContext } from './actions';

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

export function Library({ db, onOpen }: Props) {
  const [notebooks, setNotebooks] = useState<Notebook[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');

  const refresh = () => {
    void listNotebooks(db).then((nbs) => setNotebooks(nbs.sort((a, b) => b.updatedAt - a.updatedAt)));
  };
  useEffect(refresh, [db]);

  const ctx: LibraryContext = { db, refresh, openNotebook: onOpen };

  const create = async (e: Event) => {
    e.preventDefault();
    const { notebook } = await createNotebook(db, { title: title.trim() || '未命名筆記本' });
    onOpen(notebook.id);
  };

  return (
    <div class="library">
      <div class="library-actions">
        <button onClick={() => setCreating(true)}>新增筆記本</button>
        {actions.map((a) => (
          <button key={a.id} onClick={() => void a.run(ctx)}>
            {a.label}
          </button>
        ))}
      </div>
      {creating && (
        <form class="new-notebook" onSubmit={create}>
          <input
            aria-label="筆記本標題"
            placeholder="筆記本標題"
            autoFocus
            value={title}
            onInput={(e) => setTitle(e.currentTarget.value)}
          />
          <button type="submit">建立</button>
          <button type="button" onClick={() => setCreating(false)}>
            取消
          </button>
        </form>
      )}
      {notebooks?.length === 0 && <p class="empty">還沒有筆記本</p>}
      <ul class="notebook-list">
        {notebooks?.map((nb) => (
          <li key={nb.id}>
            <button class="notebook-card" onClick={() => onOpen(nb.id)}>
              <span class="cover" style={{ background: nb.coverColor }} />
              <span class="title">{nb.title}</span>
              <span class="time">{formatTime(nb.updatedAt)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
