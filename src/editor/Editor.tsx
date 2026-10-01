import { useMemo, useRef, useState } from 'preact/hooks';
import type { InkDatabase } from '../db/db';
import { deleteElements, listElements, newId, putElements } from '../db/repo';
import type { Notebook, Page, PageElement, StrokeElement } from '../db/schema';
import { elementsCommand, History, type Command, type ElementStore } from './history';
import type { NewStroke, PenSettings } from './PageCanvas';
import { PageList, type PageListHandle } from './PageList';
import { Toolbar, type ToolState } from './Toolbar';
import { COLORS, tools } from './tools';

interface Props {
  db: InkDatabase;
  notebook: Notebook;
  initialPages: Page[];
  onBack(): void;
}

type Cache = Record<string, PageElement[]>;

export function Editor({ db, notebook, initialPages, onBack }: Props) {
  const [pages] = useState(initialPages);
  // 已載入頁面的 element；ref 同步更新，讓連續書寫時 z 不會重複
  const [cache, setCache] = useState<Cache>({});
  const cacheRef = useRef<Cache>(cache);
  const loading = useRef(new Set<string>());
  const listRef = useRef<PageListHandle>(null);
  const history = useMemo(() => new History(), []);
  const [, rerender] = useState(0);
  const refresh = () => rerender((n) => n + 1);
  const [toolState, setToolState] = useState<ToolState>({ toolId: 'pen', color: COLORS[0].value, widthIdx: 1 });
  const tool = tools.find((t) => t.id === toolState.toolId)!;
  const pen: PenSettings = { tool: tool.stroke, color: toolState.color, width: tool.widths[toolState.widthIdx] };

  const updateCache = (fn: (c: Cache) => Cache) => {
    cacheRef.current = fn(cacheRef.current);
    setCache(cacheRef.current);
  };

  const load = (pageId: string) => {
    if (loading.current.has(pageId)) return;
    loading.current.add(pageId);
    void listElements(db, pageId).then((els) => updateCache((c) => ({ ...c, [pageId]: els })));
  };

  // 同時更新畫面與資料庫（未載入的頁面只寫資料庫，載入時會讀到）
  const store = useMemo<ElementStore>(() => {
    const edit = (els: PageElement[], fn: (cur: PageElement[], ids: Set<string>) => PageElement[]) =>
      updateCache((c) => {
        const next = { ...c };
        for (const pageId of new Set(els.map((e) => e.pageId))) {
          if (!next[pageId]) continue;
          next[pageId] = fn(next[pageId], new Set(els.filter((e) => e.pageId === pageId).map((e) => e.id)));
        }
        return next;
      });
    return {
      async add(els) {
        edit(els, (cur, ids) => [...cur.filter((e) => !ids.has(e.id)), ...els.filter((e) => ids.has(e.id))]);
        await putElements(db, els);
      },
      async remove(els) {
        edit(els, (cur, ids) => cur.filter((e) => !ids.has(e.id)));
        await deleteElements(db, els);
      },
    };
  }, [db]);

  const onStroke = (pageId: string, s: NewStroke) => {
    const cur = cacheRef.current[pageId] ?? [];
    const z = cur.reduce((m, e) => Math.max(m, e.z), -1) + 1;
    const el: StrokeElement = { id: newId(), pageId, z, type: 'stroke', ...s };
    // 先放進 ref（畫面在 execute 裡更新），下一筆的 z 才會正確
    cacheRef.current = { ...cacheRef.current, [pageId]: [...cur, el] };
    void history.execute(elementsCommand(store, pageId, [el])).finally(refresh);
  };

  const step = (run: () => Promise<Command | undefined>) => {
    void run()
      .then((cmd) => cmd && listRef.current?.scrollToPage(cmd.pageId))
      .finally(refresh);
  };

  return (
    <div class="editor">
      <Toolbar
        title={notebook.title}
        onBack={onBack}
        state={toolState}
        onChange={setToolState}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={() => step(() => history.undo())}
        onRedo={() => step(() => history.redo())}
      />
      <PageList
        handle={listRef}
        pages={pages}
        elementsOf={(id) => cache[id]}
        load={load}
        pen={pen}
        onStroke={onStroke}
      />
    </div>
  );
}
