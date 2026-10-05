import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Ref } from 'preact';
import { PAGE_HEIGHT, PAGE_WIDTH, type Page, type PageElement } from '../db/schema';
import type { PdfDocs } from '../pdf/render';
import { PageCanvas, type NewStroke, type PenSettings } from './PageCanvas';
import type { ImageCache } from './images';
import type { ToolDef } from './tools';

const GAP = 16;
const MAX_PAGE_WIDTH = 900;
/** 目前頁前後各保留幾頁在 DOM 中 */
const BUFFER = 1;
/** 翻頁動畫長度（與 app.css .pages-track.flipping 一致） */
const FLIP_MS = 200;

export interface PageListHandle {
  /** 翻到 pageId；找不到時翻到 fallbackIndex */
  goToPage(pageId: string, fallbackIndex?: number): void;
  /** 目前顯示的頁面 index */
  currentIndex(): number;
}

interface Props {
  pages: Page[];
  elementsOf(pageId: string): PageElement[] | undefined;
  load(pageId: string): void;
  images: ImageCache;
  pen: PenSettings;
  onStroke(pageId: string, s: NewStroke): void;
  tool: ToolDef;
  option: string | undefined;
  onCommit(pageId: string, added: PageElement[], removed: PageElement[]): Promise<void>;
  selection: { pageId: string; ids: string[] } | null;
  onSelect(pageId: string, ids: string[]): void;
  handle: Ref<PageListHandle>;
  pdfDocs: PdfDocs;
  /** 目前頁改變（含第一次顯示） */
  onPageChange(index: number): void;
}

const px = (v: number) => `${v}px`;

const NONE: string[] = [];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 頁寬：不超過容器寬度與上限，且整頁（含上下間距、頂端安全區）放得進螢幕高度 */
export function fitPageWidth(containerW: number, viewportH: number, safeTop: number): number {
  const byHeight = ((viewportH - safeTop - 2 * GAP) * PAGE_WIDTH) / PAGE_HEIGHT;
  return Math.max(0, Math.min(containerW, MAX_PAGE_WIDTH, byHeight));
}

/** 頂端安全區（狀態列）高度：.topbar 的 padding-top = env(safe-area-inset-top) */
export const safeTop = () => {
  const el = document.querySelector('.topbar');
  return el ? parseFloat(getComputedStyle(el).paddingTop) || 0 : 0;
};

/** 手指滑動 → 翻頁方向：往左滑 = 下一頁（+1）、往右滑 = 上一頁（-1）、不算滑動 = 0 */
export function swipeStep(dx: number, dy: number, ms: number): -1 | 0 | 1 {
  if (ms > 800 || Math.abs(dx) < 50 || Math.abs(dx) < 1.5 * Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

/** 雙指放大中（放大時單指拖動是原生平移，不翻頁） */
const zoomed = () => (window.visualViewport?.scale ?? 1) > 1.01;

export function PageList(props: Props) {
  const {
    pages,
    elementsOf,
    load,
    images,
    pen,
    onStroke,
    tool,
    option,
    onCommit,
    selection,
    onSelect,
    handle,
    pdfDocs,
    onPageChange,
  } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // 版面視窗高度（clientHeight 不受雙指縮放影響）與頂端安全區
  const [viewport, setViewport] = useState({ h: 0, safe: 0 });
  const [current, setCurrent] = useState(0);
  const [flipping, setFlipping] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const pageW = fitPageWidth(width, viewport.h, viewport.safe);
  const pageH = (pageW * PAGE_HEIGHT) / PAGE_WIDTH;
  // 相鄰頁相隔一個容器寬度，翻頁時旁邊的頁不會露出來
  const strideX = width + GAP;
  const n = pages.length;
  const cur = clamp(current, 0, n - 1);

  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    const onResize = () => {
      const h = document.documentElement.clientHeight;
      const safe = safeTop();
      setViewport((v) => (v.h === h && v.safe === safe ? v : { h, safe }));
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // 放大時讓單指恢復原生平移（touch-action 見 app.css）
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    const update = () => {
      if (zoomed()) root.dataset.zoomed = '';
      else root.removeAttribute('data-zoomed');
    };
    update();
    vv?.addEventListener('resize', update);
    return () => {
      vv?.removeEventListener('resize', update);
      root.removeAttribute('data-zoomed');
    };
  }, []);

  useEffect(() => onPageChange(cur), [cur]);

  const first = Math.max(0, cur - BUFFER);
  const mounted = pages.slice(first, cur + BUFFER + 1);

  useEffect(() => {
    for (const p of mounted) if (!elementsOf(p.id)) load(p.id);
  });

  /** 翻到第 i 頁；相鄰頁才有滑動動畫（跳很多頁時中間的頁不在 DOM 裡） */
  const flip = (i: number) => {
    if (i === cur) return;
    setFlipping(Math.abs(i - cur) === 1);
    setCurrent(i);
  };

  useEffect(() => {
    if (!flipping) return;
    const t = setTimeout(() => setFlipping(false), FLIP_MS + 50);
    return () => clearTimeout(t);
  }, [flipping, cur]);

  /** 第一頁／最後一頁再翻：彈一下 */
  const bounce = (dir: number) => {
    const base = `translateX(${-cur * strideX}px)`;
    trackRef.current?.animate?.(
      [{ transform: base }, { transform: `translateX(${-cur * strideX - dir * 40}px)` }, { transform: base }],
      { duration: 250, easing: 'ease-out' },
    );
  };

  // 單指左右滑動翻頁；Pencil 書寫中（手掌）、雙指、放大時不算
  const latest = useRef({ cur, n, flip, bounce });
  latest.current = { cur, n, flip, bounce };
  useEffect(() => {
    const el = ref.current!;
    const touches = new Map<number, { x: number; y: number; t: number }>();
    let multi = false;
    let pen = false;
    let penDown = false;
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'pen') {
        penDown = pen = true;
        return;
      }
      if (e.pointerType !== 'touch') return;
      if (touches.size === 0) {
        multi = false;
        pen = penDown;
      }
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp });
      if (touches.size > 1) multi = true;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType === 'pen') {
        penDown = false;
        return;
      }
      const start = touches.get(e.pointerId);
      if (!start) return;
      touches.delete(e.pointerId);
      if (e.type === 'pointercancel' || multi || pen || zoomed()) return;
      const step = swipeStep(e.clientX - start.x, e.clientY - start.y, e.timeStamp - start.t);
      if (!step) return;
      const { cur, n, flip, bounce } = latest.current;
      const next = cur + step;
      if (next < 0 || next >= n) bounce(step);
      else flip(next);
    };
    el.addEventListener('pointerdown', down, true);
    el.addEventListener('pointerup', up, true);
    el.addEventListener('pointercancel', up, true);
    return () => {
      el.removeEventListener('pointerdown', down, true);
      el.removeEventListener('pointerup', up, true);
      el.removeEventListener('pointercancel', up, true);
    };
  }, []);

  useImperativeHandle(
    handle,
    () => ({
      goToPage(pageId, fallbackIndex) {
        let i = pages.findIndex((p) => p.id === pageId);
        if (i < 0 && fallbackIndex !== undefined) i = clamp(fallbackIndex, 0, n - 1);
        if (i >= 0) flip(i);
      },
      currentIndex() {
        return cur;
      },
    }),
    [pages, cur, n],
  );

  return (
    <div class="pages" ref={ref} style={{ height: px(pageH) }} data-current={cur}>
      <div
        class={flipping ? 'pages-track flipping' : 'pages-track'}
        ref={trackRef}
        style={{ transform: `translateX(${-cur * strideX}px)` }}
      >
        {pageW > 0 &&
          mounted.map((p, k) => {
            const i = first + k;
            return (
              <div
                key={p.id}
                class="page-slot"
                style={{ left: px(i * strideX + (width - pageW) / 2), width: px(pageW), height: px(pageH) }}
              >
                <PageCanvas
                  index={i}
                  pageId={p.id}
                  images={images}
                  template={p.template}
                  pdf={p.pdf}
                  pdfDocs={pdfDocs}
                  elements={elementsOf(p.id)}
                  pen={pen}
                  onStroke={(s) => onStroke(p.id, s)}
                  tool={tool}
                  option={option}
                  onCommit={(added, removed) => onCommit(p.id, added, removed)}
                  selection={selection?.pageId === p.id ? selection.ids : NONE}
                  onSelect={(ids) => onSelect(p.id, ids)}
                />
              </div>
            );
          })}
      </div>
    </div>
  );
}
