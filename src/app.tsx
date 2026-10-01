import { useEffect, useState } from 'preact/hooks';
import { openInkDb, type InkDatabase } from './db/db';
import { createNotebook, listElements, listNotebooks, listPages } from './db/repo';
import type { Page, PageElement } from './db/schema';
import { Editor } from './editor/Editor';
import { UpdatePrompt } from './pwa/UpdatePrompt';

interface Loaded {
  db: InkDatabase;
  page: Page;
  elements: PageElement[];
}

// M2：直接開啟第一本筆記本的第一頁（沒有就建立）；書架在 M3
async function load(): Promise<Loaded> {
  const db = await openInkDb();
  let [notebook] = await listNotebooks(db);
  if (!notebook) notebook = (await createNotebook(db, { title: '我的筆記本' })).notebook;
  const [page] = await listPages(db, notebook.id);
  return { db, page, elements: await listElements(db, page.id) };
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
