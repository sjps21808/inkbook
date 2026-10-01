import { useMemo, useRef, useState } from 'preact/hooks';
import type { InkDatabase } from '../db/db';
import { deleteElements, newId, putElements } from '../db/repo';
import type { Page, PageElement, StrokeElement } from '../db/schema';
import { elementsCommand, History, type ElementStore } from './history';
import { PageCanvas, type NewStroke, type PenSettings } from './PageCanvas';

interface Props {
  db: InkDatabase;
  page: Page;
  initialElements: PageElement[];
}

const DEFAULT_PEN: PenSettings = { tool: 'pen', color: '#1c1c1e', width: 3 };

export function Editor({ db, page, initialElements }: Props) {
  const [elements, setElements] = useState(initialElements);
  const elementsRef = useRef(elements);
  elementsRef.current = elements;
  const history = useMemo(() => new History(), []);

  // 同時更新畫面與資料庫
  const store = useMemo<ElementStore>(
    () => ({
      async add(els) {
        const ids = new Set(els.map((e) => e.id));
        setElements((cur) => [...cur.filter((e) => !ids.has(e.id)), ...els]);
        await putElements(db, els);
      },
      async remove(els) {
        const ids = new Set(els.map((e) => e.id));
        setElements((cur) => cur.filter((e) => !ids.has(e.id)));
        await deleteElements(db, els);
      },
    }),
    [db],
  );

  const onStroke = (s: NewStroke) => {
    const z = elementsRef.current.reduce((m, e) => Math.max(m, e.z), -1) + 1;
    const el: StrokeElement = { id: newId(), pageId: page.id, z, type: 'stroke', ...s };
    elementsRef.current = [...elementsRef.current, el];
    void history.execute(elementsCommand(store, page.id, [el]));
  };

  return (
    <div class="editor">
      <PageCanvas elements={elements} pen={DEFAULT_PEN} onStroke={onStroke} />
    </div>
  );
}
