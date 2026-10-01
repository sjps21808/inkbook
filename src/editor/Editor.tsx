import { useMemo, useRef, useState } from 'preact/hooks';
import type { InkDatabase } from '../db/db';
import {
  addPage,
  deleteElements,
  deletePage,
  listElements,
  listPages,
  newId,
  putElements,
  restorePage,
  type PageSnapshot,
} from '../db/repo';
import type { Notebook, Page, PageElement, StrokeElement, Template } from '../db/schema';
import { elementsCommand, History, type Command, type ElementStore } from './history';
import { PageActions } from './PageActions';
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

/** 等 Preact 把狀態更新畫到畫面上 */
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export function Editor({ db, notebook, initialPages, onBack }: Props) {
  const [pages, setPages] = useState(initialPages);
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
  const setPageCache = (pageId: string, els: PageElement[] | undefined) => {
    if (els) loading.current.add(pageId);
    else loading.current.delete(pageId);
    updateCache((c) => {
      const next = { ...c };
      if (els) next[pageId] = els;
      else delete next[pageId];
      return next;
    });
  };

  const load = (pageId: string) => {
    if (loading.current.has(pageId)) return;
    loading.current.add(pageId);
    void listElements(db, pageId).then((els) => {
      if (loading.current.has(pageId)) updateCache((c) => ({ ...c, [pageId]: els }));
    });
  };

  const reloadPages = async () => setPages(await listPages(db, notebook.id));

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

  const addPageCommand = (index: number, template: Template): Command => {
    let page: Page | null = null;
    const cmd: Command = {
      pageId: '',
      pageIndex: index,
      async redo() {
        if (page) await restorePage(db, { page, elements: [] });
        else {
          page = await addPage(db, notebook.id, index, template);
          cmd.pageId = page.id;
        }
        setPageCache(page.id, []);
        await reloadPages();
      },
      async undo() {
        await deletePage(db, page!.id);
        setPageCache(page!.id, undefined);
        await reloadPages();
      },
    };
    return cmd;
  };

  const deletePageCommand = (page: Page, index: number): Command => {
    let snap: PageSnapshot | null = null;
    return {
      pageId: page.id,
      pageIndex: index,
      async redo() {
        snap = await deletePage(db, page.id);
        setPageCache(page.id, undefined);
        await reloadPages();
      },
      async undo() {
        await restorePage(db, snap!);
        setPageCache(page.id, snap!.elements);
        await reloadPages();
      },
    };
  };

  /** 執行（或 undo/redo）後捲到受影響的頁面 */
  const run = (task: () => Promise<Command | undefined>) => {
    void task()
      .then(async (cmd) => {
        if (!cmd) return;
        await nextFrame();
        listRef.current?.scrollToPage(cmd.pageId, cmd.pageIndex);
      })
      .finally(refresh);
  };
  const execute = (cmd: Command) => run(() => history.execute(cmd).then(() => cmd));

  return (
    <div class="editor">
      <Toolbar
        title={notebook.title}
        onBack={onBack}
        state={toolState}
        onChange={setToolState}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={() => run(() => history.undo())}
        onRedo={() => run(() => history.redo())}
      >
        <PageActions
          defaultTemplate={notebook.template}
          canDelete={pages.length > 1}
          currentIndex={() => listRef.current?.currentIndex() ?? 0}
          onAdd={(after, template) => execute(addPageCommand(after + 1, template))}
          onDelete={(index) => execute(deletePageCommand(pages[index], index))}
        />
      </Toolbar>
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
