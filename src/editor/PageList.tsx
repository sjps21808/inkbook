import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Ref } from 'preact';
import { PAGE_HEIGHT, PAGE_WIDTH, type Page, type PageElement } from '../db/schema';
import { PageCanvas, type NewStroke, type PenSettings } from './PageCanvas';
import type { ImageCache } from './images';
import type { ToolDef } from './tools';

const GAP = 16;
const MAX_PAGE_WIDTH = 900;
/** 可見頁前後各保留幾頁在 DOM 中 */
const BUFFER = 2;

export interface PageListHandle {
  /** 捲到 pageId；找不到時捲到 fallbackIndex */
  scrollToPage(pageId: string, fallbackIndex?: number): void;
  /** 畫面中線所在的頁面 index */
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
}

const px = (v: number) => `${v}px`;

const NONE: string[] = [];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 工具列下緣（捲動定位時要避開） */
const stickyBottom = () => document.querySelector('.toolbar')?.getBoundingClientRect().bottom ?? 0;

export function PageList(props: Props) {
  const { pages, elementsOf, load, images, pen, onStroke, tool, option, onCommit, selection, onSelect, handle } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [range, setRange] = useState<[number, number]>([0, -1]);
  const pageW = Math.min(width, MAX_PAGE_WIDTH);
  const pageH = (pageW * PAGE_HEIGHT) / PAGE_WIDTH;
  const stride = pageH + GAP;
  const n = pages.length;

  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // 依捲動位置決定要掛載的頁面
  useLayoutEffect(() => {
    if (!stride) return;
    const update = () => {
      const top = ref.current!.getBoundingClientRect().top;
      const first = Math.floor(-top / stride);
      const last = Math.floor((window.innerHeight - top) / stride);
      const s = clamp(first - BUFFER, 0, n - 1);
      const e = clamp(last + BUFFER, 0, n - 1);
      setRange((r) => (r[0] === s && r[1] === e ? r : [s, e]));
    };
    let raf = 0;
    const onScroll = () => {
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          update();
        });
      }
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [stride, n]);

  const mounted = pages.slice(range[0], range[1] + 1);

  useEffect(() => {
    for (const p of mounted) if (!elementsOf(p.id)) load(p.id);
  });

  useImperativeHandle(
    handle,
    () => ({
      scrollToPage(pageId, fallbackIndex) {
        let i = pages.findIndex((p) => p.id === pageId);
        if (i < 0 && fallbackIndex !== undefined) i = clamp(fallbackIndex, 0, n - 1);
        if (i < 0 || !stride) return;
        const top = ref.current!.getBoundingClientRect().top + i * stride;
        const visibleTop = stickyBottom();
        // 已經完整在畫面上就不捲動
        if (top >= visibleTop && top + pageH <= window.innerHeight) return;
        window.scrollTo({ top: window.scrollY + top - visibleTop - GAP });
      },
      currentIndex() {
        if (!stride) return 0;
        const top = ref.current!.getBoundingClientRect().top;
        return clamp(Math.floor((window.innerHeight / 2 - top) / stride), 0, n - 1);
      },
    }),
    [pages, stride, pageH, n],
  );

  return (
    <div class="pages" ref={ref} style={{ height: px(Math.max(0, n * stride - GAP)) }} data-stride={stride}>
      {pageW > 0 &&
        mounted.map((p, k) => {
          const i = range[0] + k;
          return (
            <div key={p.id} class="page-slot" style={{ top: px(i * stride), width: px(pageW), height: px(pageH) }}>
              <PageCanvas
                index={i}
                pageId={p.id}
                images={images}
                template={p.template}
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
  );
}
