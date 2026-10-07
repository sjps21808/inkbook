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
/** 慢慢拖超過頁寬的這個比例才翻頁 */
const DRAG_RATIO = 0.35;
/** 最後一頁往後拖超過頁寬的這個比例，放開才新增頁面（快速輕撥不算） */
const ADD_PAGE_RATIO = 0.35;
/** 拖動超過這個距離才決定是左右拖（之前不動，避免點一下就晃） */
const DRAG_LOCK = 8;
/** 白紙縮放範圍；縮放中可以暫時縮到 MIN_PINCH（放開後彈回 1x） */
export const MAX_ZOOM = 4;
const MIN_PINCH = 0.8;
/** 放開後彈回範圍內的動畫長度（與 app.css .page-slot.zoom-anim 一致） */
const ZOOM_ANIM_MS = 200;

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
  /** 頂端固定區域（分頁列＋快捷列，含狀態列）的高度 */
  topInset: number;
  /** 第一次顯示的頁面 index */
  initialIndex: number;
  /** 目前頁改變（含第一次顯示） */
  onPageChange(index: number): void;
}

const px = (v: number) => `${v}px`;

const NONE: string[] = [];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 頁寬：不超過容器寬度與上限，且整頁（含上下間距）放得進頂端固定區域（含狀態列）以下的高度 */
export function fitPageWidth(containerW: number, viewportH: number, topInset: number): number {
  const byHeight = ((viewportH - topInset - 2 * GAP) * PAGE_WIDTH) / PAGE_HEIGHT;
  return Math.max(0, Math.min(containerW, MAX_PAGE_WIDTH, byHeight));
}

/**
 * 手指滑動 → 翻頁方向：往左滑 = 下一頁（+1）、往右滑 = 上一頁（-1）、不算滑動 = 0。
 * 偏水平即可；快速輕撥（≥ 100px 且 ≥ 0.8px/ms）或慢慢拖（超過頁寬 35%，不限時間）都算
 */
export function swipeStep(dx: number, dy: number, ms: number, pageW: number): -1 | 0 | 1 {
  const ax = Math.abs(dx);
  if (ax <= Math.abs(dy)) return 0;
  const flick = ax >= 100 && ax / Math.max(ms, 1) >= 0.8;
  if (!flick && ax < pageW * DRAG_RATIO) return 0;
  return dx < 0 ? 1 : -1;
}

/** 拖動時頁面的位移：一般頁 1:1 跟手；第一頁往前、最後一頁往後是一半（橡皮筋） */
export function dragOffset(dx: number, atFirst: boolean, atLast: boolean): number {
  if ((dx > 0 && atFirst) || (dx < 0 && atLast)) return dx / 2;
  return dx;
}

/** 在最後一頁往後拖：手指拖超過頁寬 35% 才新增頁面（快速輕撥不算） */
export function addPageArmed(dx: number, dy: number, pageW: number): boolean {
  return -dx >= pageW * ADD_PAGE_RATIO && Math.abs(dx) > Math.abs(dy);
}

/**
 * 平移限制（單一軸）：白紙起點 start、長度 size，看得到的範圍 [lo, hi]。
 * 白紙比範圍大：邊緣不能被拖進範圍內；比範圍小：整張留在範圍內
 */
export function clampPan(start: number, size: number, lo: number, hi: number): number {
  return size <= hi - lo ? clamp(start, lo, hi - size) : clamp(start, hi - size, lo);
}

type Zoom = { s: number; x: number; y: number };
const NO_ZOOM: Zoom = { s: 1, x: 0, y: 0 };

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
    topInset,
  } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // 版面視窗高度（clientHeight 不受雙指縮放影響）
  const [viewportH, setViewportH] = useState(0);
  const [current, setCurrent] = useState(initialIndex);
  const trackRef = useRef<HTMLDivElement>(null);
  const pageW = fitPageWidth(width, viewportH, topInset);
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
    const onResize = () => setViewportH(document.documentElement.clientHeight);
    onResize();
    window.addEventListener('resize', onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // 頁面上的手勢全部自己處理：擋掉原生捲動、回彈與 Safari 的整頁縮放（只縮放白紙，選單不動）
  useEffect(() => {
    const el = ref.current!;
    const lock = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };
    const noGesture = (e: Event) => e.preventDefault();
    el.addEventListener('touchmove', lock, { passive: false });
    document.addEventListener('gesturestart', noGesture);
    document.addEventListener('gesturechange', noGesture);
    return () => {
      el.removeEventListener('touchmove', lock);
      document.removeEventListener('gesturestart', noGesture);
      document.removeEventListener('gesturechange', noGesture);
    };
  }, []);

  // 白紙縮放（只套在目前這一頁的 .page-slot）。手勢中直接改 DOM，結束後才更新 zoom（讓 PageCanvas 依倍率重繪）
  const zoomRef = useRef<Zoom>(NO_ZOOM);
  const [zoom, setZoom] = useState(1);
  const slotOf = (i: number) => ref.current?.querySelector<HTMLElement>(`.page-slot[data-slot="${i}"]`) ?? null;
  const applyZoom = (z: Zoom, anim = false) => {
    zoomRef.current = z;
    const slot = slotOf(latest.current.cur);
    if (!slot) return;
    slot.classList.toggle('zoom-anim', anim);
    slot.style.transform = z.s === 1 && !z.x && !z.y ? '' : `translate(${z.x}px, ${z.y}px) scale(${z.s})`;
  };
  // 換頁、旋轉時回到 1x
  useLayoutEffect(() => {
    for (const s of ref.current!.querySelectorAll<HTMLElement>('.page-slot')) s.style.transform = '';
    zoomRef.current = NO_ZOOM;
    setZoom(1);
  }, [cur, width, viewportH]);

  useEffect(() => onPageChange(cur), [cur]);

  const first = Math.max(0, cur - BUFFER);
  const mounted = pages.slice(first, cur + BUFFER + 1);

  useEffect(() => {
    for (const p of mounted) if (!elementsOf(p.id)) load(p.id);
  });

  // 動畫 class 只由這裡控制（不經過 Preact 渲染），連續翻頁時才不會被舊的計時器中途拿掉
  const animTimer = useRef(0);
  /** 接下來的位置變化用動畫，結束後拿掉 */
  const animate = () => {
    const t = trackRef.current;
    if (!t) return;
    t.classList.add('flipping');
    clearTimeout(animTimer.current);
    animTimer.current = window.setTimeout(() => t.classList.remove('flipping'), FLIP_MS + 50);
  };
  /** 停止動畫：之後的位置變化立刻生效 */
  const stopAnimation = () => {
    clearTimeout(animTimer.current);
    trackRef.current?.classList.remove('flipping');
  };

  /** 翻到第 i 頁；相鄰頁才有滑動動畫（跳很多頁時中間的頁不在 DOM 裡） */
  const flip = (i: number) => {
    if (i === cur) return;
    if (Math.abs(i - cur) === 1) animate();
    else stopAnimation();
    setCurrent(i);
  };

  // 單指左右拖動：頁面跟著手指走，放開後翻頁或彈回；Pencil 書寫中（手掌）、雙指、放大時不算
  const latest = useRef({ cur, n, flip, onFlipPastEnd, strideX, pageW, pageH, width, topInset, animate, stopAnimation, applyZoom, setZoom });
  latest.current = { cur, n, flip, onFlipPastEnd, strideX, pageW, pageH, width, topInset, animate, stopAnimation, applyZoom, setZoom };
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
    // 開始拖動時軌道在畫面上的位置（翻頁動畫可能還沒播完，從看得到的位置接著拖）
    let origin = 0;
    const base = () => -latest.current.cur * latest.current.strideX;
    /** 軌道目前實際的位移（含播放中的動畫） */
    const visibleX = () => {
      const t = track();
      if (!t) return base();
      try {
        return new DOMMatrixReadOnly(getComputedStyle(t).transform).m41;
      } catch {
        return base();
      }
    };
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
        if (t) t.style.transform = `translateX(${origin + offset}px)`;
      });
    };
    /** 確定是左右拖動：停在目前看得到的位置，之後從這裡跟手 */
    const grab = () => {
      origin = visibleX();
      latest.current.stopAnimation();
      const t = track();
      if (t) t.style.transform = `translateX(${origin}px)`;
    };
    /** 結束拖動：沒有翻頁時用動畫彈回原位 */
    const settle = () => {
      cancelAnimationFrame(raf);
      setArmed(false);
      const t = track();
      if (!t) return;
      latest.current.animate();
      t.style.transform = `translateX(${base()}px)`;
    };
    // ---- 縮放與平移 ----
    /** 目前頁沒縮放時左上角在畫面上的位置 */
    const slotOrigin = () => {
      const r = el.getBoundingClientRect();
      const { width, pageW } = latest.current;
      return { x: r.left + (width - pageW) / 2, y: r.top };
    };
    /** 把位移限制在看得到的範圍內（頂端固定區域以下、左右與下方留 GAP） */
    const clampZoom = (z: Zoom): Zoom => {
      const { pageW, pageH, topInset } = latest.current;
      const o = slotOrigin();
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      return {
        s: z.s,
        x: clampPan(o.x + z.x, pageW * z.s, GAP, vw - GAP) - o.x,
        y: clampPan(o.y + z.y, pageH * z.s, topInset + GAP, vh - GAP) - o.y,
      };
    };
    let pinch: { d0: number; mx: number; my: number; z0: Zoom } | null = null;
    let pan: { x: number; y: number; z0: Zoom } | null = null;
    let zoomTimer = 0;
    const two = () => [...touches.values()].slice(0, 2);
    /** 手勢結束：低於 1x 彈回、位置拉回範圍內，動畫結束後依倍率重繪 */
    const endZoom = () => {
      const z = zoomRef.current;
      const target = z.s <= 1 ? NO_ZOOM : clampZoom(z);
      latest.current.applyZoom(target, true);
      clearTimeout(zoomTimer);
      zoomTimer = window.setTimeout(() => latest.current.setZoom(target.s), ZOOM_ANIM_MS + 20);
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
      pan = null;
      if (touches.size > 1) {
        multi = true;
        if (dragging) {
          dragging = false;
          settle();
        }
        if (!pen && touches.size === 2) {
          const [a, b] = two();
          pinch = {
            d0: Math.hypot(a.lx - b.lx, a.ly - b.ly) || 1,
            mx: (a.lx + b.lx) / 2,
            my: (a.ly + b.ly) / 2,
            z0: zoomRef.current,
          };
        }
      } else if (zoomRef.current.s > 1 && !pen) {
        // 放大時單指 = 平移白紙
        pan = { x: e.clientX, y: e.clientY, z0: zoomRef.current };
      }
    };
    const move = (e: PointerEvent) => {
      const t = touches.get(e.pointerId);
      if (!t) return;
      t.lx = e.clientX;
      t.ly = e.clientY;
      t.lt = e.timeStamp;
      if (pinch && touches.size >= 2) {
        // 以兩指中點為錨點：手指下的那一點跟著手指走
        const [a, b] = two();
        const { d0, mx, my, z0 } = pinch;
        const s = clamp((z0.s * Math.hypot(a.lx - b.lx, a.ly - b.ly)) / d0, MIN_PINCH, MAX_ZOOM);
        const o = slotOrigin();
        const px = (mx - o.x - z0.x) / z0.s;
        const py = (my - o.y - z0.y) / z0.s;
        const cx = (a.lx + b.lx) / 2;
        const cy = (a.ly + b.ly) / 2;
        latest.current.applyZoom({ s, x: cx - o.x - px * s, y: cy - o.y - py * s });
        return;
      }
      if (pan) {
        latest.current.applyZoom(
          clampZoom({ s: pan.z0.s, x: pan.z0.x + e.clientX - pan.x, y: pan.z0.y + e.clientY - pan.y }),
        );
        return;
      }
      if (multi || pen) return;
      const dx = e.clientX - t.x;
      const dy = e.clientY - t.y;
      if (!dragging && Math.abs(dx) > DRAG_LOCK && Math.abs(dx) > Math.abs(dy)) {
        dragging = true;
        grab();
      }
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
      if (pinch && touches.size < 2) {
        pinch = null;
        endZoom();
        return;
      }
      if (pan) {
        pan = null;
        return;
      }
      if (multi || pen) {
        if (wasDragging) settle();
        return;
      }
      const [x, y, t] = e.type === 'pointercancel' ? [start.lx, start.ly, start.lt] : [e.clientX, e.clientY, e.timeStamp];
      const dx = x - start.x;
      const dy = y - start.y;
      const { cur, n, flip, onFlipPastEnd, pageW } = latest.current;
      const step = swipeStep(dx, dy, t - start.t, pageW);
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
      clearTimeout(zoomTimer);
      el.removeEventListener('pointerdown', down, true);
      el.removeEventListener('pointermove', move, true);
      el.removeEventListener('pointerup', up, true);
      el.removeEventListener('pointercancel', up, true);
    };
  }, []);

  useEffect(() => () => clearTimeout(animTimer.current), []);

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
        class="pages-track"
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
                data-slot={i}
                style={{ left: px(i * strideX + (width - pageW) / 2), width: px(pageW), height: px(pageH) }}
              >
                <PageCanvas
                  index={i}
                  zoom={i === cur ? zoom : 1}
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
