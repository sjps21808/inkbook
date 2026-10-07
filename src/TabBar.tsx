import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { InkDatabase } from './db/db';
import { getNotebook } from './db/repo';
import { NOTEBOOKS_CHANGED } from './tabs';

interface Props {
  db: InkDatabase;
  tabs: string[];
  /** 目前開著的筆記本（書架頁為 null） */
  active: string | null;
  onSelect(id: string): void;
  onClose(id: string): void;
  /** 「＋」：回書架挑別本 */
  onAdd(): void;
  /** 這些分頁的筆記本已經不存在 */
  onMissing(ids: string[]): void;
}

/** 筆記本分頁列：太多時左右滑動，目前分頁自動捲到看得到的位置 */
export function TabBar({ db, tabs, active, onSelect, onClose, onAdd, onMissing }: Props) {
  const [titles, setTitles] = useState<Record<string, string>>({});
  const listRef = useRef<HTMLDivElement>(null);

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
        {tabs.map((id) => {
          const title = titles[id] ?? '…';
          return (
            <div key={id} class="tab" role="tab" aria-selected={id === active} data-id={id}>
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
        ＋
      </button>
    </div>
  );
}
