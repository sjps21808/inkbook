import { useEffect, useState } from 'preact/hooks';
import { openInkDb, type InkDatabase } from './db/db';
import { openFirstPage, requestPersist } from './bootstrap';
import type { Page, PageElement } from './db/schema';
import { Editor } from './editor/Editor';
import { UpdatePrompt } from './pwa/UpdatePrompt';

interface Loaded {
  db: InkDatabase;
  page: Page;
  elements: PageElement[];
}

async function load(): Promise<Loaded> {
  void requestPersist();
  const db = await openInkDb();
  return { db, ...(await openFirstPage(db)) };
}

export function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    void load().then(setLoaded);
  }, []);

  return (
    <>
      <header class="topbar">
        <h1>InkBook</h1>
        <span class="version">版本 {__APP_VERSION__}</span>
        <UpdatePrompt />
      </header>
      <main>
        {loaded ? (
          <Editor db={loaded.db} page={loaded.page} initialElements={loaded.elements} />
        ) : (
          <p class="empty">載入中…</p>
        )}
      </main>
    </>
  );
}
