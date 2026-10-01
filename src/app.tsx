import { useEffect, useState } from 'preact/hooks';
import { loadNotebook, requestPersist, type OpenedNotebook } from './bootstrap';
import { openInkDb, type InkDatabase } from './db/db';
import { Editor } from './editor/Editor';
import { Library } from './library/Library';
import { UpdatePrompt } from './pwa/UpdatePrompt';
import { notebookHash, useRoute } from './router';

function NotebookView({ db, id }: { db: InkDatabase; id: string }) {
  const [opened, setOpened] = useState<OpenedNotebook | null | undefined>(undefined);
  useEffect(() => {
    void loadNotebook(db, id).then(setOpened);
  }, [db, id]);

  if (opened === undefined) return <p class="empty">載入中…</p>;
  if (opened === null) return <p class="empty">找不到這本筆記本</p>;
  return (
    <Editor
      db={db}
      notebook={opened.notebook}
      page={opened.page}
      initialElements={opened.elements}
      onBack={() => (location.hash = '#/')}
    />
  );
}

export function App() {
  const [db, setDb] = useState<InkDatabase | null>(null);
  const route = useRoute();

  useEffect(() => {
    void requestPersist();
    void openInkDb().then(setDb);
  }, []);

  return (
    <>
      <header class="topbar">
        <h1>InkBook</h1>
        <span class="version">版本 {__APP_VERSION__}</span>
        <UpdatePrompt />
      </header>
      <main>
        {!db ? (
          <p class="empty">載入中…</p>
        ) : route.name === 'notebook' ? (
          <NotebookView key={route.id} db={db} id={route.id} />
        ) : (
          <Library db={db} onOpen={(id) => (location.hash = notebookHash(id))} />
        )}
      </main>
    </>
  );
}
