import type { VNode } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { loadNotebook, requestPersist, type OpenedNotebook } from './bootstrap';
import { openInkDb, type InkDatabase } from './db/db';
import { Editor } from './editor/Editor';
import { Library } from './library/Library';
import { UpdatePrompt } from './pwa/UpdatePrompt';
import { notebookHash, useRoute } from './router';
import { TabBar } from './TabBar';
import { closeTab, loadTabs, openTab, pruneTabs, saveTabs } from './tabs';
import { ThemeSelect } from './ThemeSelect';

function NotebookView({ db, id, tabBar }: { db: InkDatabase; id: string; tabBar: VNode }) {
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
      initialPages={opened.pages}
      onBack={() => (location.hash = '#/')}
      tabBar={tabBar}
    />
  );
}

export function App() {
  const [db, setDb] = useState<InkDatabase | null>(null);
  const route = useRoute();
  const [tabs, setTabsState] = useState(loadTabs);
  const active = route.name === 'notebook' ? route.id : null;

  useEffect(() => {
    void requestPersist();
    void openInkDb().then(setDb);
  }, []);

  const setTabs = (update: (t: string[]) => string[]) =>
    setTabsState((t) => {
      const next = update(t);
      if (next !== t) saveTabs(next);
      return next;
    });

  // 打開筆記本 = 新開分頁（已開著就不變）
  useEffect(() => {
    if (active) setTabs((t) => openTab(t, active));
  }, [active]);

  const goTo = (id: string | null) => (location.hash = id ? notebookHash(id) : '#/');
  const tabBar = db ? (
    <TabBar
      db={db}
      tabs={tabs}
      active={active}
      onSelect={goTo}
      onAdd={() => goTo(null)}
      onClose={(id) => {
        const { tabs: rest, next } = closeTab(tabs, id, active);
        setTabs(() => rest);
        if (next !== active) goTo(next);
      }}
      onMissing={(ids) => setTabs((t) => pruneTabs(t, (id) => !ids.includes(id)))}
    />
  ) : null;

  return (
    <>
      <div class="hud app-hud">
        {/* 書架頁也顯示分頁列（編輯頁的分頁列在頂端固定區域裡） */}
        {route.name === 'library' && tabs.length > 0 && tabBar}
        <header class="topbar">
          <h1>InkBook</h1>
          <span class="version">版本 {__APP_VERSION__}</span>
          <ThemeSelect />
          <UpdatePrompt />
        </header>
      </div>
      <main>
        {!db ? (
          <p class="empty">載入中…</p>
        ) : route.name === 'notebook' ? (
          <NotebookView key={route.id} db={db} id={route.id} tabBar={tabBar!} />
        ) : (
          <Library db={db} onOpen={(id) => (location.hash = notebookHash(id))} />
        )}
      </main>
    </>
  );
}
