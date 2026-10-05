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
const FLIP_MS = 280;
/** 最後一頁往後拖超過頁寬的這個比例，放開才新增頁面 */
const ADD_PAGE_RATIO = 0.2;
/** 拖動超過這個距離才決定是左右拖（之前不動，避免點一下就晃） */
const DRAG_LOCK = 8;

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
  /** 在最後一頁再往後翻 */
  onFlipPastEnd(): void;
  /** 第一次顯示的頁面 index */
  initialIndex: number;
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

/**
 * 手指滑動 → 翻頁方向：往左滑 = 下一頁（+1）、往右滑 = 上一頁（-1）、不算滑動 = 0。
 * 偏水平即可；快速輕撥（≥ 15px 且 ≥ 0.3px/ms）或慢慢拖（≥ 40px，不限時間）都算
 */
export function swipeStep(dx: number, dy: number, ms: number): -1 | 0 | 1 {
  const ax = Math.abs(dx);
  if (ax <= Math.abs(dy)) return 0;
  const flick = ax >= 15 && ax / Math.max(ms, 1) >= 0.3;
  if (!flick && ax < 40) return 0;
  return dx < 0 ? 1 : -1;
}

/** 拖動時頁面的位移：一般頁 1:1 跟手；第一頁往前、最後一頁往後是一半（橡皮筋） */
export function dragOffset(dx: number, atFirst: boolean, atLast: boolean): number {
  if ((dx > 0 && atFirst) || (dx < 0 && atLast)) return dx / 2;
  return dx;
}

/** 在最後一頁往後拖：手指拖超過頁寬 20% 才新增頁面（快速輕撥不算） */
export function addPageArmed(dx: number, dy: number, pageW: number): boolean {
  return -dx >= pageW * ADD_PAGE_RATIO && Math.abs(dx) > Math.abs(dy);
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
    initialIndex,
    onFlipPastEnd,
  } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // 版面視窗高度（clientHeight 不受雙指縮放影響）與頂端安全區
  const [viewport, setViewport] = useState({ h: 0, safe: 0 });
  const [current, setCurrent] = useState(initialIndex);
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

  // 單指左右拖動：頁面跟著手指走，放開後翻頁或彈回；Pencil 書寫中（手掌）、雙指、放大時不算
  const latest = useRef({ cur, n, flip, onFlipPastEnd, strideX, pageW });
  latest.current = { cur, n, flip, onFlipPastEnd, strideX, pageW };
  useEffect(() => {
    const el = ref.current!;
    // 起點與最後位置（iPad 中途接管手勢時會送 pointercancel，用最後位置判斷）
    const touches = new Map<number, { x: number; y: number; t: number; lx: number; ly: number; lt: number }>();
    let multi = false;
    let pen = false;
    let penDown = false;
    // 已確定是左右拖動（之後每次移動都直接改軌道位置，不經過 Preact 重新渲染）
    let dragging = false;
    let raf = 0;
    const base = () => -latest.current.cur * latest.current.strideX;
    const track = () => trackRef.current;
    const setArmed = (on: boolean) => {
      if (on) el.dataset.addArmed = '';
      else el.removeAttribute('data-add-armed');
    };
    /** 拖動中：直接設定位移（不加動畫） */
    const follow = (dx: number, dy: number) => {
      const { cur, n, pageW } = latest.current;
      const offset = dragOffset(dx, cur === 0, cur === n - 1);
      setArmed(cur === n - 1 && addPageArmed(dx, dy, pageW));
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const t = track();
        if (!t) return;
        t.classList.remove('flipping');
        t.style.transform = `translateX(${base() + offset}px)`;
      });
    };
    /** 結束拖動：沒有翻頁時用動畫彈回原位 */
    const settle = () => {
      cancelAnimationFrame(raf);
      setArmed(false);
      const t = track();
      if (!t) return;
      t.classList.add('flipping');
      t.style.transform = `translateX(${base()}px)`;
      setTimeout(() => t.classList.remove('flipping'), FLIP_MS + 50);
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'pen') {
        penDown = pen = true;
        if (dragging) {
          dragging = false;
          settle();
        }
        return;
      }
      if (e.pointerType !== 'touch') return;
      if (touches.size === 0) {
        multi = false;
        dragging = false;
        pen = penDown;
      }
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp, lx: e.clientX, ly: e.clientY, lt: e.timeStamp });
      if (touches.size > 1) {
        multi = true;
        if (dragging) {
          dragging = false;
          settle();
        }
      }
    };
    const move = (e: PointerEvent) => {
      const t = touches.get(e.pointerId);
      if (!t) return;
      t.lx = e.clientX;
      t.ly = e.clientY;
      t.lt = e.timeStamp;
      if (multi || pen || zoomed()) return;
      const dx = e.clientX - t.x;
      const dy = e.clientY - t.y;
      if (!dragging && Math.abs(dx) > DRAG_LOCK && Math.abs(dx) > Math.abs(dy)) dragging = true;
      if (dragging) follow(dx, dy);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType === 'pen') {
        penDown = false;
        return;
      }
      const start = touches.get(e.pointerId);
      if (!start) return;
      touches.delete(e.pointerId);
      const wasDragging = dragging;
      dragging = false;
      if (multi || pen || zoomed()) {
        if (wasDragging) settle();
        return;
      }
      const [x, y, t] = e.type === 'pointercancel' ? [start.lx, start.ly, start.lt] : [e.clientX, e.clientY, e.timeStamp];
      const dx = x - start.x;
      const dy = y - start.y;
      const { cur, n, flip, onFlipPastEnd, pageW } = latest.current;
      const step = swipeStep(dx, dy, t - start.t);
      if (step === 1 && cur === n - 1) {
        // 最後一頁：要拖夠遠才新增；新頁出現後從目前位置滑過去
        if (addPageArmed(dx, dy, pageW)) {
          cancelAnimationFrame(raf);
          setArmed(false);
          onFlipPastEnd();
        } else settle();
        return;
      }
      const next = cur + step;
      if (step && next >= 0) {
        cancelAnimationFrame(raf);
        flip(next);
      } else if (wasDragging) settle();
    };
    el.addEventListener('pointerdown', down, true);
    el.addEventListener('pointermove', move, true);
    el.addEventListener('pointerup', up, true);
    el.addEventListener('pointercancel', up, true);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointerdown', down, true);
      el.removeEventListener('pointermove', move, true);
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
      <div class="add-hint" aria-hidden="true">
        ＋<br />
        新增頁面
      </div>
    </div>
  );
}
