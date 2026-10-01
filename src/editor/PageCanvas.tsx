import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { PAGE_HEIGHT, PAGE_WIDTH, type PageElement, type StrokeElement, type Template } from '../db/schema';
import type { ImageCache } from './images';
import { drawStroke, renderInk } from './stroke';
import { drawTemplate } from './templates';
import type { ToolDef } from './tools';
import { SELECTION_PAD_PX, selectionBounds } from './tools/lasso';
import type { Point, ToolContext, ToolSession } from './tools/types';

/** canvas 單邊像素上限（4GB RAM iPad 的記憶體考量） */
const MAX_CANVAS_PX = 4096;

export interface PenSettings {
  tool: StrokeElement['tool'];
  color: string;
  width: number;
}

export type NewStroke = Pick<StrokeElement, 'tool' | 'color' | 'width' | 'points'>;

interface Props {
  index: number;
  pageId: string;
  images: ImageCache;
  template: Template;
  /** undefined = 還在載入（此時不能書寫） */
  elements: PageElement[] | undefined;
  pen: PenSettings;
  onStroke(s: NewStroke): void;
  /** 目前的工具（有 pointer 時由工具處理筆的輸入） */
  tool: ToolDef;
  /** 目前工具的選項 id */
  option: string | undefined;
  onCommit(added: PageElement[], removed: PageElement[]): Promise<void>;
  /** 這一頁選取中的 element id */
  selection: string[];
  onSelect(ids: string[]): void;
}

/** Safari 專有：Apple Pencil 的 touch 為 'stylus' */
type SafariTouch = Touch & { touchType?: 'direct' | 'stylus' };

const isDrawPointer = (e: PointerEvent) =>
  e.pointerType === 'pen' || (import.meta.env.DEV && e.pointerType === 'mouse');

/** 全部頁面只讓一張 live canvas 佔用記憶體：換頁書寫時釋放前一張 */
let activeLive: HTMLCanvasElement | null = null;

const release = (cv: HTMLCanvasElement) => {
  cv.width = 0;
  cv.height = 0;
};

export function PageCanvas(props: Props) {
  const { index, template, elements } = props;
  const pageRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const scaleRef = useRef(1);
  const elementsRef = useRef(elements);
  elementsRef.current = elements;
  // 工具操作中的暫時畫面（例如擦除中）
  const [preview, setPreview] = useState<PageElement[] | null>(null);
  const shown = preview ?? elements;
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const templateRef = useRef(template);
  templateRef.current = template;
  const propsRef = useRef(props);
  propsRef.current = props;

  const paintInk = () => {
    const ctx = inkRef.current?.getContext('2d');
    if (!ctx) return;
    const els = shownRef.current ?? [];
    const { images } = propsRef.current;
    renderInk(ctx, els, scaleRef.current, (id) => images.peek(id));
    // 還沒解碼的圖片：解碼完成後重畫
    for (const e of els) {
      if (e.type === 'image' && !images.peek(e.blobId)) {
        images.load(e.blobId).then(() => inkRef.current && paintInk(), () => {});
      }
    }
  };

  // 依顯示大小調整 canvas 解析度；卸載時釋放 canvas 記憶體
  useLayoutEffect(() => {
    const page = pageRef.current!;
    const bg = bgRef.current!;
    const ink = inkRef.current!;
    const live = liveRef.current!;
    const resize = () => {
      const rect = page.getBoundingClientRect();
      if (!rect.width) return;
      const dpr = window.devicePixelRatio || 1;
      const k = Math.min(dpr, MAX_CANVAS_PX / rect.height);
      const w = Math.round(rect.width * k);
      const h = Math.round(rect.height * k);
      for (const cv of activeLive === live ? [bg, ink, live] : [bg, ink]) {
        if (cv.width !== w || cv.height !== h) {
          cv.width = w;
          cv.height = h;
        }
      }
      scaleRef.current = w / PAGE_WIDTH;
      drawTemplate(bg.getContext('2d')!, templateRef.current, scaleRef.current);
      paintInk();
    };
    // canvas 預設 300×150；live 等到書寫時才配置
    if (activeLive !== live) release(live);
    const ro = new ResizeObserver(resize);
    ro.observe(page);
    resize();
    return () => {
      ro.disconnect();
      if (activeLive === live) activeLive = null;
      [bg, ink, live].forEach(release);
    };
  }, []);

  useEffect(paintInk, [shown]);

  // 輸入：pen 畫圖；touch 交給原生捲動與縮放
  // 用 layout effect 在繪製前掛上監聽，頁面一出現就能書寫
  useLayoutEffect(() => {
    const page = pageRef.current!;
    const ink = inkRef.current!;
    const live = liveRef.current!;
    let pointerId: number | null = null;
    let pts: number[] = [];
    let raf = 0;
    let session: ToolSession | null = null;
    // 每次預覽遞增；寫入完成時只在之後沒有新預覽的情況下清除
    let previewSeq = 0;

    const toPoint = (e: PointerEvent): Point => {
      const r = page.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) / r.width) * PAGE_WIDTH,
        y: ((e.clientY - r.top) / r.height) * PAGE_HEIGHT,
        pressure: e.pressure,
      };
    };
    const toPage = (e: PointerEvent) => {
      const p = toPoint(e);
      pts.push(p.x, p.y, p.pressure);
    };
    const current = (): StrokeElement => ({
      id: '',
      pageId: '',
      z: 0,
      type: 'stroke',
      ...propsRef.current.pen,
      points: Float32Array.from(pts),
    });
    const claimLive = () => {
      if (activeLive !== live) {
        if (activeLive) release(activeLive);
        activeLive = live;
      }
      if (live.width !== ink.width || live.height !== ink.height) {
        live.width = ink.width;
        live.height = ink.height;
      }
    };
    const clearLive = () => {
      const ctx = live.getContext('2d')!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, live.width, live.height);
    };
    const drawLive = () => {
      raf = 0;
      clearLive();
      if (pointerId !== null) drawStroke(live.getContext('2d')!, current(), scaleRef.current);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(drawLive);
    };

    const toolContext = (): ToolContext => {
      const p = propsRef.current;
      return {
        pageId: p.pageId,
        elements: elementsRef.current ?? [],
        color: p.pen.color,
        width: p.pen.width,
        option: p.option,
        ptPerPx: PAGE_WIDTH / page.getBoundingClientRect().width,
        preview(els) {
          previewSeq++;
          setPreview(els);
        },
        drawLive(draw) {
          clearLive();
          if (!draw) return;
          const ctx = live.getContext('2d')!;
          ctx.save();
          ctx.setTransform(scaleRef.current, 0, 0, scaleRef.current, 0, 0);
          draw(ctx);
          ctx.restore();
        },
        selection: p.selection,
        select: (ids) => propsRef.current.onSelect(ids),
        commit(added, removed) {
          const seq = previewSeq;
          void propsRef.current.onCommit(added, removed).finally(() => {
            if (seq === previewSeq) setPreview(null);
          });
        },
      };
    };

    const down = (e: PointerEvent) => {
      if (!isDrawPointer(e)) return;
      e.preventDefault();
      if (pointerId !== null || !elementsRef.current) return;
      pointerId = e.pointerId;
      try {
        page.setPointerCapture(e.pointerId);
      } catch {
        // 合成事件（測試）沒有對應的實體 pointer
      }
      claimLive();
      const tool = propsRef.current.tool;
      if (tool.pointer) {
        session = tool.pointer(toolContext(), toPoint(e)) ?? null;
        if (!session) pointerId = null;
        return;
      }
      pts = [];
      toPage(e);
      schedule();
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      e.preventDefault();
      const evs = e.getCoalescedEvents?.() ?? [];
      for (const ce of evs.length ? evs : [e]) {
        if (session) session.move(toPoint(ce));
        else toPage(ce);
      }
      if (!session) schedule();
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      if (session) {
        const s = session;
        session = null;
        pointerId = null;
        s.up(toPoint(e));
        return;
      }
      const s = current();
      pointerId = null;
      cancelAnimationFrame(raf);
      raf = 0;
      // 先把這一筆畫到 ink，避免存檔完成前閃爍
      drawStroke(ink.getContext('2d')!, s, scaleRef.current);
      clearLive();
      propsRef.current.onStroke({ tool: s.tool, color: s.color, width: s.width, points: s.points });
    };
    // iOS：pointerdown 的 preventDefault 擋不住捲動；筆觸碰或書寫中（手掌）時擋掉 touch
    const touch = (e: TouchEvent) => {
      if (pointerId !== null || [...e.touches].some((t) => (t as SafariTouch).touchType === 'stylus')) {
        e.preventDefault();
      }
    };
    const noMenu = (e: Event) => e.preventDefault();

    page.addEventListener('pointerdown', down);
    page.addEventListener('pointermove', move);
    page.addEventListener('pointerup', up);
    page.addEventListener('pointercancel', up);
    page.addEventListener('touchstart', touch, { passive: false });
    page.addEventListener('touchmove', touch, { passive: false });
    page.addEventListener('contextmenu', noMenu);
    return () => {
      cancelAnimationFrame(raf);
      page.removeEventListener('pointerdown', down);
      page.removeEventListener('pointermove', move);
      page.removeEventListener('pointerup', up);
      page.removeEventListener('pointercancel', up);
      page.removeEventListener('touchstart', touch);
      page.removeEventListener('touchmove', touch);
      page.removeEventListener('contextmenu', noMenu);
    };
  }, []);

  const box = props.selection.length ? selectionBounds(shown ?? [], props.selection) : null;

  return (
    <div class="page" ref={pageRef} data-index={index} data-ready={elements ? '' : undefined}>
      <canvas class="bg" ref={bgRef} />
      <canvas class="ink" ref={inkRef} />
      <canvas class="live" ref={liveRef} />
      <div class="overlay">{box && <SelectionBox box={box} />}</div>
    </div>
  );
}

const pct = (v: number, total: number) => `${(v / total) * 100}%`;

/** 選取框（外擴 SELECTION_PAD_PX）與右下角的縮放把手 */
function SelectionBox({ box }: { box: { x: number; y: number; w: number; h: number } }) {
  const pad = `${SELECTION_PAD_PX}px`;
  return (
    <div
      class="selection"
      style={{
        left: `calc(${pct(box.x, PAGE_WIDTH)} - ${pad})`,
        top: `calc(${pct(box.y, PAGE_HEIGHT)} - ${pad})`,
        width: `calc(${pct(box.w, PAGE_WIDTH)} + 2 * ${pad})`,
        height: `calc(${pct(box.h, PAGE_HEIGHT)} + 2 * ${pad})`,
      }}
    >
      <div class="handle" />
    </div>
  );
}
