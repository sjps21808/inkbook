import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { ColorPicker } from './ColorPicker';
import { useDismiss } from './dismiss';
import {
  DuplicateIcon,
  EraserIcon,
  HighlighterIcon,
  LassoIcon,
  MenuToggleIcon,
  PenIcon,
  RedoIcon,
  TrashIcon,
  UndoIcon,
  WidthIcon,
} from './icons';
import { toolOption, type ToolState } from './Toolbar';
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

/** 快捷列上的工具按鈕；有選項的工具（橡皮擦）選中後再點一次，跳出選項小選單 */
function ToolButton({ id, state, onChange }: { id: string; state: ToolState; onChange(s: ToolState): void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const t = tools.find((x) => x.id === id)!;
  const ToolIcon = TOOL_ICONS[id];
  const active = state.toolId === id;
  return (
    <span class="tool-button" ref={ref}>
      <button
        aria-label={t.label}
        aria-pressed={active}
        aria-haspopup={t.options ? 'true' : undefined}
        aria-expanded={t.options ? open : undefined}
        onClick={() => {
          if (active && t.options) setOpen((o) => !o);
          else {
            setOpen(false);
            onChange({ ...state, toolId: id });
          }
        }}
      >
        <ToolIcon />
      </button>
      {open && t.options && (
        <div class="tool-options" role="group" aria-label={`${t.label}模式`}>
          {t.options.map((o) => (
            <button
              key={o.id}
              aria-pressed={toolOption(state, t) === o.id}
              onClick={() => {
                onChange({ ...state, options: { ...state.options, [id]: o.id } });
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

export function QuickBar(props: Props) {
  const { state, onChange, canUndo, canRedo, onUndo, onRedo, menuOpen, onToggleMenu, hasSelection } = props;
  return (
    <div class="quickbar" role="toolbar" aria-label="快捷工具">
      <button
        class="menu-toggle"
        aria-label={menuOpen ? '收起選單' : '展開選單'}
        aria-expanded={menuOpen}
        onClick={onToggleMenu}
      >
        <MenuToggleIcon open={menuOpen} />
      </button>
      <span class="sep" />
      {QUICK_TOOLS.map((id) => (
        <ToolButton key={id} id={id} state={state} onChange={onChange} />
      ))}
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
