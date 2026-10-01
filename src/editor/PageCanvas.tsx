import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { PAGE_HEIGHT, PAGE_WIDTH, type PageElement, type StrokeElement, type Template } from '../db/schema';
import { drawStroke, renderInk } from './stroke';
import { drawTemplate } from './templates';

/** canvas 單邊像素上限（4GB RAM iPad 的記憶體考量） */
const MAX_CANVAS_PX = 4096;

export interface PenSettings {
  tool: StrokeElement['tool'];
  color: string;
  width: number;
}

export type NewStroke = Pick<StrokeElement, 'tool' | 'color' | 'width' | 'points'>;

interface Props {
  template: Template;
  elements: PageElement[];
  pen: PenSettings;
  onStroke(s: NewStroke): void;
}

/** Safari 專有：Apple Pencil 的 touch 為 'stylus' */
type SafariTouch = Touch & { touchType?: 'direct' | 'stylus' };

const isDrawPointer = (e: PointerEvent) =>
  e.pointerType === 'pen' || (import.meta.env.DEV && e.pointerType === 'mouse');

export function PageCanvas({ template, elements, pen, onStroke }: Props) {
  const pageRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const scaleRef = useRef(1);
  const elementsRef = useRef(elements);
  elementsRef.current = elements;
  const templateRef = useRef(template);
  templateRef.current = template;
  const penRef = useRef(pen);
  penRef.current = pen;
  const onStrokeRef = useRef(onStroke);
  onStrokeRef.current = onStroke;

  const paintInk = () => {
    const ctx = inkRef.current?.getContext('2d');
    if (ctx) renderInk(ctx, elementsRef.current, scaleRef.current);
  };

  // 依顯示大小調整 canvas 解析度
  useLayoutEffect(() => {
    const page = pageRef.current!;
    const resize = () => {
      const rect = page.getBoundingClientRect();
      if (!rect.width) return;
      const dpr = window.devicePixelRatio || 1;
      const k = Math.min(dpr, MAX_CANVAS_PX / rect.height);
      const w = Math.round(rect.width * k);
      const h = Math.round(rect.height * k);
      for (const cv of [bgRef.current!, inkRef.current!, liveRef.current!]) {
        if (cv.width !== w || cv.height !== h) {
          cv.width = w;
          cv.height = h;
        }
      }
      scaleRef.current = w / PAGE_WIDTH;
      drawTemplate(bgRef.current!.getContext('2d')!, templateRef.current, scaleRef.current);
      paintInk();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(page);
    resize();
    return () => ro.disconnect();
  }, []);

  useEffect(paintInk, [elements]);

  // 輸入：pen 畫圖；touch 交給原生捲動與縮放
  // 用 layout effect 在繪製前掛上監聽，頁面一出現就能書寫
  useLayoutEffect(() => {
    const page = pageRef.current!;
    const live = liveRef.current!;
    let pointerId: number | null = null;
    let pts: number[] = [];
    let raf = 0;

    const toPage = (e: PointerEvent) => {
      const r = page.getBoundingClientRect();
      pts.push(
        ((e.clientX - r.left) / r.width) * PAGE_WIDTH,
        ((e.clientY - r.top) / r.height) * PAGE_HEIGHT,
        e.pressure,
      );
    };
    const current = (): StrokeElement => ({
      id: '',
      pageId: '',
      z: 0,
      type: 'stroke',
      ...penRef.current,
      points: Float32Array.from(pts),
    });
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

    const down = (e: PointerEvent) => {
      if (!isDrawPointer(e) || pointerId !== null) return;
      e.preventDefault();
      pointerId = e.pointerId;
      try {
        page.setPointerCapture(e.pointerId);
      } catch {
        // 合成事件（測試）沒有對應的實體 pointer
      }
      pts = [];
      toPage(e);
      schedule();
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      e.preventDefault();
      const evs = e.getCoalescedEvents?.() ?? [];
      for (const ce of evs.length ? evs : [e]) toPage(ce);
      schedule();
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const s = current();
      pointerId = null;
      cancelAnimationFrame(raf);
      raf = 0;
      // 先把這一筆畫到 ink，避免存檔完成前閃爍
      drawStroke(inkRef.current!.getContext('2d')!, s, scaleRef.current);
      clearLive();
      onStrokeRef.current({ tool: s.tool, color: s.color, width: s.width, points: s.points });
    };
    // iOS：pointerdown 的 preventDefault 擋不住捲動；筆觸碰或書寫中（手掌）時擋掉 touch
    const touch = (e: TouchEvent) => {
      if (pointerId !== null || [...e.touches].some((t) => (t as SafariTouch).touchType === 'stylus')) e.preventDefault();
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

  return (
    <div class="page" ref={pageRef}>
      <canvas class="bg" ref={bgRef} />
      <canvas class="ink" ref={inkRef} />
      <canvas class="live" ref={liveRef} />
      <div class="overlay" />
    </div>
  );
}
