import { useEffect, useRef, useState } from 'preact/hooks';
import type { InkDatabase } from '../db/db';
import { listElements } from '../db/repo';
import { PAGE_HEIGHT, PAGE_WIDTH, type Page, type PageElement } from '../db/schema';
import type { PdfDocs } from '../pdf/render';
import type { ImageCache } from './images';
import { renderInk } from './stroke';
import { drawText } from './text';
import { drawTemplate } from './templates';

const THUMB_W = 120;
const THUMB_H = Math.round((THUMB_W * PAGE_HEIGHT) / PAGE_WIDTH);
/** 每個縮圖項目的高度（拖曳時用來換算位置） */
const ITEM_H = THUMB_H + 32;
const EDGE = 40;

interface Props {
  db: InkDatabase;
  images: ImageCache;
  pages: Page[];
  elementsOf(pageId: string): PageElement[] | undefined;
  /** 頁面內容的版本；變動時重新產生縮圖 */
  versions: Record<string, number>;
  pdfDocs: PdfDocs;
  onJump(index: number): void;
  onReorder(from: number, to: number): void;
}

const px = (v: number) => `${v}px`;

async function renderThumb(page: Page, els: PageElement[], images: ImageCache, pdfDocs: PdfDocs): Promise<string> {
  const bitmaps = new Map<string, ImageBitmap>();
  for (const e of els) {
    if (e.type === 'image') {
      try {
        bitmaps.set(e.blobId, await images.load(e.blobId));
      } catch {
        // 讀不到的圖片略過
      }
    }
  }
  const scale = (THUMB_W * 2) / PAGE_WIDTH;
  const make = () => {
    const cv = document.createElement('canvas');
    cv.width = THUMB_W * 2;
    cv.height = THUMB_H * 2;
    return cv;
  };
  const bg = make();
  const ink = make();
  const ctx = bg.getContext('2d')!;
  drawTemplate(ctx, page.template, scale);
  if (page.pdf) await pdfDocs.render(bg, page.pdf, scale).done;
  const inkCtx = ink.getContext('2d')!;
  renderInk(inkCtx, els, scale, (id) => bitmaps.get(id));
  for (const e of els) if (e.type === 'text') drawText(inkCtx, e, scale);
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(ink, 0, 0);
  const blob = await new Promise<Blob | null>((r) => bg.toBlob(r));
  for (const cv of [bg, ink]) cv.width = cv.height = 0;
  return URL.createObjectURL(blob!);
}

export function Thumbnails({ db, images, pages, elementsOf, versions, pdfDocs, onJump, onReorder }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const urls = useRef(new Map<string, { url: string; v: number }>());
  const pending = useRef(new Set<string>());
  const visible = useRef(new Set<string>());
  const queue = useRef(Promise.resolve());
  const [, force] = useState(0);
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number } | null>(null);
  const latest = useRef({ pages, elementsOf, versions });
  latest.current = { pages, elementsOf, versions };

  const generate = (pageId: string) => {
    const { pages, versions } = latest.current;
    const page = pages.find((p) => p.id === pageId);
    const v = versions[pageId] ?? 0;
    if (!page || urls.current.get(pageId)?.v === v || pending.current.has(pageId)) return;
    pending.current.add(pageId);
    // 依序產生，避免一次佔用太多記憶體與 CPU
    queue.current = queue.current
      .then(async () => {
        const els = latest.current.elementsOf(pageId) ?? (await listElements(db, pageId));
        const url = await renderThumb(page, els, images, pdfDocs);
        const old = urls.current.get(pageId);
        if (old) URL.revokeObjectURL(old.url);
        urls.current.set(pageId, { url, v });
      })
      .finally(() => {
        pending.current.delete(pageId);
        force((n) => n + 1);
      });
  };

  // 捲入可見範圍才產生縮圖
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.id!;
          if (e.isIntersecting) {
            visible.current.add(id);
            generate(id);
          } else visible.current.delete(id);
        }
      },
      { root: listRef.current, rootMargin: '200px 0px' },
    );
    listRef.current!.querySelectorAll('.thumb').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pages]);

  // 內容改變時重新產生看得到的縮圖
  useEffect(() => {
    visible.current.forEach(generate);
  }, [versions]);

  useEffect(
    () => () => {
      urls.current.forEach(({ url }) => URL.revokeObjectURL(url));
    },
    [],
  );

  const startDrag = (e: PointerEvent, from: number) => {
    e.preventDefault();
    const grip = e.currentTarget as HTMLElement;
    const list = listRef.current!;
    grip.setPointerCapture?.(e.pointerId);
    const startY = e.clientY;
    const startScroll = list.scrollTop;
    let to = from;
    const move = (ev: PointerEvent) => {
      const r = list.getBoundingClientRect();
      if (ev.clientY < r.top + EDGE) list.scrollTop -= 12;
      else if (ev.clientY > r.bottom - EDGE) list.scrollTop += 12;
      const dy = ev.clientY - startY + (list.scrollTop - startScroll);
      to = Math.max(0, Math.min(pages.length - 1, from + Math.round(dy / ITEM_H)));
      setDrag({ from, to, dy });
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      setDrag(null);
      if (to !== from) onReorder(from, to);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
    setDrag({ from, to, dy: 0 });
  };

  const shift = (i: number) => {
    if (!drag) return 0;
    if (i === drag.from) return drag.dy;
    if (drag.from < i && i <= drag.to) return -ITEM_H;
    if (drag.to <= i && i < drag.from) return ITEM_H;
    return 0;
  };

  return (
    <aside class="thumbnails" ref={listRef} aria-label="頁面縮圖">
      {pages.map((p, i) => (
        <div
          key={p.id}
          class={`thumb${drag?.from === i ? ' dragging' : ''}`}
          data-id={p.id}
          data-thumb-index={i}
          style={{ height: px(ITEM_H), transform: `translateY(${px(shift(i))})` }}
        >
          <button class="thumb-img" aria-label={`第 ${i + 1} 頁`} onClick={() => onJump(i)}>
            {urls.current.get(p.id) && <img src={urls.current.get(p.id)!.url} alt="" draggable={false} />}
          </button>
          <div class="thumb-bar">
            <span>{i + 1}</span>
            <span class="grip" aria-label={`拖曳第 ${i + 1} 頁`} onPointerDown={(e) => startDrag(e, i)}>
              ☰
            </span>
          </div>
        </div>
      ))}
    </aside>
  );
}
