import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { InkDatabase } from '../db/db';
import {
  addPage,
  deleteElements,
  deletePage,
  listElements,
  listPages,
  newId,
  putElements,
  reorderPages,
  restorePage,
  type PageSnapshot,
} from '../db/repo';
import type { Notebook, Page, PageElement, StrokeElement, Template, TextElement } from '../db/schema';
import { runExport } from '../export/ExportDialog';
import { PdfDocs } from '../pdf/render';
import { transformElement } from './geometry';
import { ImageCache } from './images';
import { loadCollapsed, saveCollapsed } from './chrome';
import { loadLastPage, saveLastPage } from './lastPage';
import { nextPageTemplate } from './templates';
import { blurEditing } from './text';
import { elementsCommand, History, type Command, type ElementStore } from './history';
import { PageActions } from './PageActions';
import type { NewStroke, PenSettings } from './PageCanvas';
import { PageList, type PageListHandle } from './PageList';
import { QuickBar } from './QuickBar';
import { useHudViewport } from './hud';
import { Thumbnails } from './Thumbnails';
import { Toolbar, toolOption, type ToolState } from './Toolbar';
import { tools, type ToolDef } from './tools';
import { loadToolState, saveToolState } from './toolMemory';

interface Props {
  db: InkDatabase;
  notebook: Notebook;
  initialPages: Page[];
  onBack(): void;
  /** 筆記本分頁列（放在頂端固定區域最上面） */
  tabBar?: ComponentChildren;
}

type Cache = Record<string, PageElement[]>;

/** 等 Preact 把狀態更新畫到畫面上 */
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export function Editor({ db, notebook, initialPages, onBack, tabBar }: Props) {
  const [pages, setPages] = useState(initialPages);
  // 已載入頁面的 element；ref 同步更新，讓連續書寫時 z 不會重複
  const [cache, setCache] = useState<Cache>({});
  // 每頁內容的版本（縮圖據此重新產生）
  const [versions, setVersions] = useState<Record<string, number>>({});
  const [showThumbs, setShowThumbs] = useState(false);
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [initialIndex] = useState(() => loadLastPage(notebook.id, initialPages));
  const [current, setCurrent] = useState(initialIndex);
  // 頂端固定區域的高度：頁面從它下面開始（--band-h 給 CSS 用：編輯區上邊距、大選單、縮圖側欄的位置）
  const bandRef = useRef<HTMLDivElement>(null);
  const [bandH, setBandH] = useState(0);
  const cacheRef = useRef<Cache>(cache);
  const loading = useRef(new Set<string>());
  const listRef = useRef<PageListHandle>(null);
  const history = useMemo(() => new History(), []);
  const images = useMemo(() => new ImageCache(db), [db]);
  const pdfDocs = useMemo(() => new PdfDocs(db), [db]);
  useEffect(() => () => pdfDocs.destroy(), [pdfDocs]);
  const [, rerender] = useState(0);
  const refresh = () => rerender((n) => n + 1);
  // 這本筆記本上次用的工具、顏色、粗細（切換分頁回來時恢復）
  const [toolState, setToolState] = useState<ToolState>(() => loadToolState(notebook.id));
  // layout effect：選完工具馬上切分頁也來得及存
  useLayoutEffect(() => saveToolState(notebook.id, toolState), [toolState]);
  const tool = tools.find((t) => t.id === toolState.toolId)!;
  const [selection, setSelection] = useState<{ pageId: string; ids: string[] } | null>(null);
  const pen: PenSettings = { tool: tool.stroke, color: toolState.color, width: tool.widths[toolState.widthIdx] };

  const bump = (pageIds: Iterable<string>) =>
    setVersions((v) => {
      const next = { ...v };
      for (const id of pageIds) next[id] = (next[id] ?? 0) + 1;
      return next;
    });
  const updateCache = (fn: (c: Cache) => Cache) => {
    cacheRef.current = fn(cacheRef.current);
    setCache(cacheRef.current);
  };
  const setPageCache = (pageId: string, els: PageElement[] | undefined) => {
    bump([pageId]);
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
    const edit = (els: PageElement[], fn: (cur: PageElement[], ids: Set<string>) => PageElement[]) => {
      bump(new Set(els.map((e) => e.pageId)));
      updateCache((c) => {
        const next = { ...c };
        for (const pageId of new Set(els.map((e) => e.pageId))) {
          if (!next[pageId]) continue;
          next[pageId] = fn(next[pageId], new Set(els.filter((e) => e.pageId === pageId).map((e) => e.id)));
        }
        return next;
      });
    };
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

  /** 工具（橡皮擦等）完成一次操作 */
  const onCommit = (pageId: string, added: PageElement[], removed: PageElement[]) => {
    const gone = new Set(removed.map((e) => e.id));
    const cur = (cacheRef.current[pageId] ?? []).filter((e) => !gone.has(e.id));
    cacheRef.current = { ...cacheRef.current, [pageId]: [...cur, ...added] };
    return history.execute(elementsCommand(store, pageId, added, removed)).finally(refresh);
  };

  const selected = () => {
    if (!selection) return [];
    const ids = new Set(selection.ids);
    return (cacheRef.current[selection.pageId] ?? []).filter((e) => ids.has(e.id));
  };

  const onToolChange = (s: ToolState) => {
    blurEditing();
    if (s.toolId !== toolState.toolId) setSelection(null);
    else if (s.color !== toolState.color && selection) {
      // 有選取時點顏色 = 改選取內容的顏色
      const before = selected().filter((e): e is StrokeElement | TextElement => e.type !== 'image');
      if (before.length) void onCommit(selection.pageId, before.map((e) => ({ ...e, color: s.color })), before);
    }
    setToolState(s);
  };

  const duplicateSelection = () => {
    if (!selection) return;
    const { pageId } = selection;
    let z = (cacheRef.current[pageId] ?? []).reduce((m, e) => Math.max(m, e.z), -1) + 1;
    const copies = selected()
      .sort((a, b) => a.z - b.z)
      .map((e) => transformElement({ ...e, id: newId(), z: z++ }, { s: 1, ox: 0, oy: 0, dx: 20, dy: 20 }));
    void onCommit(pageId, copies, []);
    setSelection({ pageId, ids: copies.map((e) => e.id) });
  };

  /** 一次性動作（圖片）：插入到畫面中間那一頁，然後用套索選取 */
  const onAction = (t: ToolDef) => {
    const pageId = pages[listRef.current?.currentIndex() ?? 0].id;
    t.action!({
      db,
      pageId,
      nextZ: (cacheRef.current[pageId] ?? []).reduce((m, e) => Math.max(m, e.z), -1) + 1,
      insert(els) {
        void onCommit(pageId, els, []);
        setToolState((s) => ({ ...s, toolId: 'lasso' }));
        setSelection({ pageId, ids: els.map((e) => e.id) });
      },
    });
  };

  const deleteSelection = () => {
    if (!selection) return;
    void onCommit(selection.pageId, [], selected());
    setSelection(null);
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

  const reorderCommand = (from: number, to: number): Command => {
    const before = pages.map((p) => p.id);
    const after = [...before];
    const [moved] = after.splice(from, 1);
    after.splice(to, 0, moved);
    return {
      pageId: moved,
      async redo() {
        await reorderPages(db, notebook.id, after);
        await reloadPages();
      },
      async undo() {
        await reorderPages(db, notebook.id, before);
        await reloadPages();
      },
    };
  };

  /** 執行（或 undo/redo）後翻到受影響的頁面 */
  const run = (task: () => Promise<Command | undefined>) => {
    // 先存下編輯中的文字（排在這個動作之前）
    blurEditing();
    setSelection(null);
    void task()
      .then(async (cmd) => {
        if (!cmd) return;
        await nextFrame();
        listRef.current?.goToPage(cmd.pageId, cmd.pageIndex);
      })
      .finally(refresh);
  };
  // <html data-chrome>：編輯頁的大選單（頂端列 + 工具列）浮在頁面上方，收起時隱藏（見 app.css）
  // layout effect：離開編輯頁時同步拿掉，回書架不會閃一下編輯頁的版面
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.chrome = collapsed ? 'collapsed' : 'expanded';
    return () => root.removeAttribute('data-chrome');
  }, [collapsed]);

  // 記住目前頁（頁面增刪後同一個 index 可能換成別頁，所以也跟著 pages 更新）
  useEffect(() => {
    const i = Math.min(current, pages.length - 1);
    if (i >= 0) saveLastPage(notebook.id, pages[i].id, i);
  }, [current, pages]);

  /** 翻過最後一頁：在最後新增一頁（可以 undo），run 會翻過去 */
  const addPageAtEnd = () => {
    const last = pages[pages.length - 1];
    execute(addPageCommand(pages.length, nextPageTemplate(last, notebook.template)));
  };

  useHudViewport();

  useLayoutEffect(() => {
    const band = bandRef.current!;
    const root = document.documentElement.style;
    // 精確高度（可能有小數；不受放大時 .hud 縮放影響）
    const update = (h: number) => {
      root.setProperty('--band-h', `${h}px`);
      setBandH(h);
    };
    update(band.offsetHeight);
    const ro = new ResizeObserver(([e]) => update(e.borderBoxSize?.[0]?.blockSize ?? band.offsetHeight));
    ro.observe(band);
    return () => {
      ro.disconnect();
      root.removeProperty('--band-h');
    };
  }, []);

  const toggleChrome = () => {
    saveCollapsed(!collapsed);
    setCollapsed(!collapsed);
  };

  const execute = (cmd: Command) => run(() => history.execute(cmd).then(() => cmd));

  return (
    <div class="editor">
      {/* 浮在頁面上的介面：放大時反向縮放，維持原本大小（見 hud.ts） */}
      <div class="hud">
        {/* 頂端固定區域：不蓋住白紙 */}
        <div class="top-band" ref={bandRef}>
          {tabBar}
          <QuickBar
            state={toolState}
            onChange={onToolChange}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={() => run(() => history.undo())}
            onRedo={() => run(() => history.redo())}
            menuOpen={!collapsed}
            onToggleMenu={toggleChrome}
            hasSelection={!!selection && selection.ids.length > 0}
            onDuplicate={duplicateSelection}
            onDeleteSelection={deleteSelection}
          />
        </div>
        {/* 大選單：從頂端固定區域下方展開，蓋在白紙上 */}
        <div class="menu-drop">
          <Toolbar title={notebook.title} onBack={onBack} state={toolState} onChange={onToolChange} onAction={onAction}>
            <div class="group page-nav" aria-label="翻頁">
              <button
                aria-label="上一頁"
                disabled={current <= 0}
                onClick={() => listRef.current?.goToPage(pages[current - 1].id)}
              >
                ‹
              </button>
              <span class="page-no">
                {Math.min(current, pages.length - 1) + 1} / {pages.length}
              </span>
              <button
                aria-label="下一頁"
                onClick={() =>
                  current >= pages.length - 1 ? addPageAtEnd() : listRef.current?.goToPage(pages[current + 1].id)
                }
              >
                ›
              </button>
            </div>
            <div class="group">
              <button aria-pressed={showThumbs} onClick={() => setShowThumbs((s) => !s)}>
                頁面
              </button>
            </div>
            <div class="group">
              <button
                onClick={() => {
                  blurEditing(); // 編輯中的文字先存檔
                  runExport(db, notebook);
                }}
              >
                匯出 PDF
              </button>
            </div>
            <PageActions
              defaultTemplate={notebook.template}
              canDelete={pages.length > 1}
              currentIndex={() => listRef.current?.currentIndex() ?? 0}
              onAdd={(after, template) => execute(addPageCommand(after + 1, template))}
              onDelete={(index) => execute(deletePageCommand(pages[index], index))}
            />
          </Toolbar>
        </div>
        {showThumbs && (
          <Thumbnails
            db={db}
            images={images}
            pages={pages}
            elementsOf={(id) => cache[id]}
            versions={versions}
            pdfDocs={pdfDocs}
            onJump={(i) => listRef.current?.goToPage(pages[i].id)}
            onReorder={(from, to) => execute(reorderCommand(from, to))}
          />
        )}
      </div>
      <PageList
        handle={listRef}
        pages={pages}
        elementsOf={(id) => cache[id]}
        load={load}
        images={images}
        pen={pen}
        onStroke={onStroke}
        tool={tool}
        option={toolOption(toolState, tool)}
        onCommit={onCommit}
        selection={selection}
        onSelect={(pageId, ids) => setSelection(ids.length ? { pageId, ids } : null)}
        pdfDocs={pdfDocs}
        onPageChange={setCurrent}
        onFlipPastEnd={addPageAtEnd}
        topInset={bandH}
        initialIndex={initialIndex}
      />
    </div>
  );
}
