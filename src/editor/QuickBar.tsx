import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useState } from 'preact/hooks';
import { ColorPicker } from './ColorPicker';
import {
  DuplicateIcon,
  EraserIcon,
  HighlighterIcon,
  LassoIcon,
  MenuIcon,
  PenIcon,
  RedoIcon,
  TrashIcon,
  UndoIcon,
  WidthIcon,
} from './icons';
import type { ToolState } from './Toolbar';
import { tools, WIDTH_LABELS } from './tools';

/** 浮動快捷列上的工具（其餘工具在大選單） */
export const QUICK_TOOLS = ['pen', 'highlighter', 'eraser', 'lasso'];

const TOOL_ICONS: Record<string, () => ComponentChildren> = {
  pen: PenIcon,
  highlighter: HighlighterIcon,
  eraser: EraserIcon,
  lasso: LassoIcon,
};

const WIDTH_ICONS = [1.5, 3, 5];

interface Props {
  state: ToolState;
  onChange(s: ToolState): void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo(): void;
  onRedo(): void;
  menuOpen: boolean;
  onToggleMenu(): void;
  hasSelection: boolean;
  onDuplicate(): void;
  onDeleteSelection(): void;
}

/** 大選單下緣（展開時浮動列貼在它下面；收起時貼齊頂端安全區，見 app.css） */
function useMenuBottom(menuOpen: boolean) {
  const [bottom, setBottom] = useState<number | null>(null);
  useLayoutEffect(() => {
    const menu = document.querySelector('.toolbar');
    if (!menuOpen || !menu) {
      setBottom(null);
      return;
    }
    const update = () => setBottom(menu.getBoundingClientRect().bottom);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(menu);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [menuOpen]);
  return bottom;
}

export function QuickBar(props: Props) {
  const { state, onChange, canUndo, canRedo, onUndo, onRedo, menuOpen, onToggleMenu, hasSelection } = props;
  const menuBottom = useMenuBottom(menuOpen);
  return (
    <div
      class="quickbar"
      role="toolbar"
      aria-label="快捷工具"
      style={menuBottom === null ? undefined : { top: `${menuBottom + 8}px` }}
    >
      <button
        class="menu-toggle"
        aria-label={menuOpen ? '收起選單' : '展開選單'}
        aria-expanded={menuOpen}
        onClick={onToggleMenu}
      >
        <MenuIcon />
      </button>
      <span class="sep" />
      {QUICK_TOOLS.map((id) => {
        const t = tools.find((x) => x.id === id)!;
        const ToolIcon = TOOL_ICONS[id];
        return (
          <button
            key={id}
            aria-label={t.label}
            aria-pressed={state.toolId === id}
            onClick={() => onChange({ ...state, toolId: id })}
          >
            <ToolIcon />
          </button>
        );
      })}
      <span class="sep" />
      {WIDTH_LABELS.map((label, i) => (
        <button
          key={label}
          aria-label={label}
          aria-pressed={state.widthIdx === i}
          onClick={() => onChange({ ...state, widthIdx: i })}
        >
          <WidthIcon width={WIDTH_ICONS[i]} />
        </button>
      ))}
      <span class="sep" />
      <ColorPicker value={state.color} onChange={(color) => onChange({ ...state, color })} />
      <span class="sep" />
      <button aria-label="復原" disabled={!canUndo} onClick={onUndo}>
        <UndoIcon />
      </button>
      <button aria-label="重做" disabled={!canRedo} onClick={onRedo}>
        <RedoIcon />
      </button>
      {hasSelection && (
        <>
          <span class="sep" />
          <button aria-label="複製選取" onClick={props.onDuplicate}>
            <DuplicateIcon />
          </button>
          <button aria-label="刪除選取" onClick={props.onDeleteSelection}>
            <TrashIcon />
          </button>
        </>
      )}
    </div>
  );
}
