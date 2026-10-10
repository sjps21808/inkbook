import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { InkDatabase } from './db/db';
import { HomeIcon } from './editor/icons';
import { getNotebook } from './db/repo';
import { moveTab, NOTEBOOKS_CHANGED } from './tabs';

interface Props {
  db: InkDatabase;
  tabs: string[];
  /** 目前開著的筆記本（書架頁為 null） */
  active: string | null;
  onSelect(id: string): void;
  onClose(id: string): void;
  /** 房屋圖示：回書架挑別本 */
  onAdd(): void;
  /** 這些分頁的筆記本已經不存在 */
  onMissing(ids: string[]): void;
  /** 長按拖曳排序：把 from 移到 to */
  onReorder(from: number, to: number): void;
}

/** 按住多久開始拖曳；這段時間內移動超過 MOVE_PX 就當作左右捲動分頁列 */
const HOLD_MS = 400;
const MOVE_PX = 8;

/** 筆記本分頁列：太多時左右滑動，目前分頁自動捲到看得到的位置 */
export function TabBar({ db, tabs, active, onSelect, onClose, onAdd, onMissing, onReorder }: Props) {
  const [titles, setTitles] = useState<Record<string, string>>({});
  const listRef = useRef<HTMLDivElement>(null);
  // 拖曳中：from = 被拖的分頁、to = 目前要放的位置（畫面先照預覽順序排）
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const latest = useRef({ onReorder });
  latest.current = { onReorder };

  useEffect(() => {
    const list = listRef.current!;
    let timer = 0;
    let start: { x: number; y: number; id: number; from: number } | null = null;
    let centers: number[] = [];
    let dragging: { from: number; to: number } | null = null;
    let suppressClick = false;
    const reset = () => {
      clearTimeout(timer);
      start = null;
      dragging = null;
      setDrag(null);
    };
    const down = (e: PointerEvent) => {
      const el = (e.target as Element).closest<HTMLElement>('.tab');
      if (!el || (e.target as Element).closest('.tab-close')) return;
      const from = [...list.querySelectorAll('.tab')].indexOf(el);
      start = { x: e.clientX, y: e.clientY, id: e.pointerId, from };
      timer = window.setTimeout(() => {
        if (!start) return;
        centers = [...list.querySelectorAll('.tab')].map((t) => {
          const r = t.getBoundingClientRect();
          return r.left + r.width / 2;
        });
        dragging = { from: start.from, to: start.from };
        setDrag(dragging);
        try {
          list.setPointerCapture(start.id);
        } catch {
          // 合成事件（測試）沒有對應的實體 pointer
        }
      }, HOLD_MS);
    };
    const move = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      if (!dragging) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_PX) {
          clearTimeout(timer);
          start = null;
        }
        return;
      }
      // 放在「中心點在手指左邊的其他分頁」之後
      const to = centers.filter((c, i) => i !== dragging!.from && c < e.clientX).length;
      if (to !== dragging.to) {
        dragging = { ...dragging, to };
        setDrag(dragging);
      }
    };
    const up = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      if (dragging) {
        suppressClick = true;
        if (e.type === 'pointerup' && dragging.to !== dragging.from)
          latest.current.onReorder(dragging.from, dragging.to);
      }
      reset();
    };
    // 拖曳中擋掉原生捲動與放開時的點擊（不切換分頁）
    const touchmove = (e: TouchEvent) => {
      if (dragging) e.preventDefault();
    };
    const click = (e: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
    };
    list.addEventListener('pointerdown', down);
    list.addEventListener('pointermove', move);
    list.addEventListener('pointerup', up);
    list.addEventListener('pointercancel', up);
    list.addEventListener('touchmove', touchmove, { passive: false });
    list.addEventListener('click', click, true);
    return () => {
      clearTimeout(timer);
      list.removeEventListener('pointerdown', down);
      list.removeEventListener('pointermove', move);
      list.removeEventListener('pointerup', up);
      list.removeEventListener('pointercancel', up);
      list.removeEventListener('touchmove', touchmove);
      list.removeEventListener('click', click, true);
    };
  }, []);

  const shown = drag ? moveTab(tabs, drag.from, drag.to) : tabs;
  const dragged = drag ? tabs[drag.from] : null;

  // 標題從資料庫讀；書架改名、刪除後重新讀
  useEffect(() => {
    let alive = true;
    const load = () =>
      void Promise.all(tabs.map((id) => getNotebook(db, id))).then((nbs) => {
        if (!alive) return;
        const next: Record<string, string> = {};
        const missing: string[] = [];
        nbs.forEach((nb, i) => (nb ? (next[tabs[i]] = nb.title) : missing.push(tabs[i])));
        setTitles(next);
        if (missing.length) onMissing(missing);
      });
    load();
    window.addEventListener(NOTEBOOKS_CHANGED, load);
    return () => {
      alive = false;
      window.removeEventListener(NOTEBOOKS_CHANGED, load);
    };
  }, [db, tabs.join('\n')]);

  useLayoutEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
  }, [active, tabs.length]);

  return (
    <div class="tabs-row">
      <div class="tabbar" role="tablist" aria-label="筆記本分頁" ref={listRef}>
        {shown.map((id) => {
          const title = titles[id] ?? '…';
          return (
            <div
              key={id}
              class={id === dragged ? 'tab dragging' : 'tab'}
              role="tab"
              aria-selected={id === active}
              data-id={id}
            >
              <button class="tab-title" onClick={() => onSelect(id)}>
                {title}
              </button>
              <button class="tab-close" aria-label={`關閉 ${title}`} onClick={() => onClose(id)}>
                ×
              </button>
            </div>
          );
        })}
      </div>
      <button class="tab-add" aria-label="開啟其他筆記本" onClick={onAdd}>
        <HomeIcon />
      </button>
    </div>
  );
}
