import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { ColorPicker } from './ColorPicker';
import { useDismiss } from './dismiss';
import {
  ChevronIcon,
  DuplicateIcon,
  EraserIcon,
  HighlighterIcon,
  LassoIcon,
  MenuToggleIcon,
  PenIcon,
  RectLassoIcon,
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

/**
 * 按鈕在手指（或筆）一碰到時就動作，不等 click：iPad 上快速連點兩個按鈕時，
 * 第二下常被 Safari 當成雙擊而收不到 click，看起來像沒反應。
 * 鍵盤操作（Enter／空白鍵）沒有 pointerdown，click 的 detail = 0，照樣用 click 觸發
 */
const tap = (fn: () => void) => ({
  onPointerDown: (e: PointerEvent) => {
    if (e.button === 0 && !(e.currentTarget as HTMLButtonElement).disabled) fn();
  },
  onClick: (e: MouseEvent) => {
    if (e.detail === 0) fn();
  },
});

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
  // 套索的圖示隨模式變（自由 = 虛線圈、矩形 = 虛線方框）
  const ToolIcon = id === 'lasso' && toolOption(state, t) === 'rect' ? RectLassoIcon : TOOL_ICONS[id];
  const active = state.toolId === id;
  return (
    <span class="tool-button" ref={ref}>
      <button
        aria-label={t.label}
        aria-pressed={active}
        aria-haspopup={t.options ? 'true' : undefined}
        aria-expanded={t.options ? open : undefined}
        {...tap(() => {
          if (active && t.options) setOpen((o) => !o);
          else {
            setOpen(false);
            onChange({ ...state, toolId: id });
          }
        })}
      >
        <ToolIcon />
        {active && t.options && <ChevronIcon />}
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
        {...tap(onToggleMenu)}
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
          {...tap(() => onChange({ ...state, widthIdx: i }))}
        >
          <WidthIcon width={WIDTH_ICONS[i]} />
        </button>
      ))}
      <span class="sep" />
      <ColorPicker value={state.color} onChange={(color) => onChange({ ...state, color })} />
      <span class="sep" />
      <button aria-label="復原" disabled={!canUndo} {...tap(onUndo)}>
        <UndoIcon />
      </button>
      <button aria-label="重做" disabled={!canRedo} {...tap(onRedo)}>
        <RedoIcon />
      </button>
      {hasSelection && (
        <>
          <span class="sep" />
          <button aria-label="複製選取" {...tap(props.onDuplicate)}>
            <DuplicateIcon />
          </button>
          <button aria-label="刪除選取" {...tap(props.onDeleteSelection)}>
            <TrashIcon />
          </button>
        </>
      )}
    </div>
  );
}
