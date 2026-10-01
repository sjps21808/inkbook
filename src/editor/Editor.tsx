import { useMemo, useRef, useState } from 'preact/hooks';
import type { InkDatabase } from '../db/db';
import { deleteElements, newId, putElements } from '../db/repo';
import type { Page, PageElement, StrokeElement } from '../db/schema';
import { elementsCommand, History, type ElementStore } from './history';
import { PageCanvas, type NewStroke, type PenSettings } from './PageCanvas';
import { Toolbar, type ToolState } from './Toolbar';
import { COLORS, tools } from './tools';

interface Props {
  db: InkDatabase;
  page: Page;
  initialElements: PageElement[];
}


export function Editor({ db, page, initialElements }: Props) {
  const [elements, setElements] = useState(initialElements);
  const elementsRef = useRef(elements);
  elementsRef.current = elements;
  const history = useMemo(() => new History(), []);
  const [, rerender] = useState(0);
  const refresh = () => rerender((n) => n + 1);
  const [toolState, setToolState] = useState<ToolState>({ toolId: 'pen', color: COLORS[0].value, widthIdx: 1 });
  const tool = tools.find((t) => t.id === toolState.toolId)!;
  const pen: PenSettings = { tool: tool.stroke, color: toolState.color, width: tool.widths[toolState.widthIdx] };

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
    void history.execute(elementsCommand(store, page.id, [el])).finally(refresh);
  };

  return (
    <div class="editor">
      <Toolbar
        state={toolState}
        onChange={setToolState}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={() => void history.undo().finally(refresh)}
        onRedo={() => void history.redo().finally(refresh)}
      />
      <PageCanvas elements={elements} pen={pen} onStroke={onStroke} />
    </div>
  );
}
