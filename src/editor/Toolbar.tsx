import type { ComponentChildren } from 'preact';
import { COLORS, tools, WIDTH_LABELS, type ToolDef } from './tools';

export interface ToolState {
  toolId: string;
  color: string;
  widthIdx: number;
  /** 各工具選擇的選項 id（沒選過 = 第一項） */
  options: Record<string, string>;
}

export const toolOption = (s: ToolState, tool: ToolDef) => s.options[tool.id] ?? tool.options?.[0].id;

interface Props {
  title: string;
  onBack(): void;
  state: ToolState;
  onChange(s: ToolState): void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo(): void;
  onRedo(): void;
  /** 工具列尾端的其他按鈕（頁面操作） */
  children?: ComponentChildren;
}

export function Toolbar({ title, onBack, state, onChange, canUndo, canRedo, onUndo, onRedo, children }: Props) {
  const active = tools.find((t) => t.id === state.toolId)!;
  return (
    <div class="toolbar" role="toolbar" aria-label="工具列">
      <div class="group">
        <button onClick={onBack}>‹ 書架</button>
        <span class="nb-title">{title}</span>
      </div>
      <div class="group">
        {tools.map((t) => (
          <button
            key={t.id}
            aria-pressed={state.toolId === t.id}
            onClick={() => onChange({ ...state, toolId: t.id })}
          >
            {t.label}
          </button>
        ))}
      </div>
      {active.options && (
        <div class="group" aria-label={`${active.label}選項`}>
          {active.options.map((o) => (
            <button
              key={o.id}
              aria-pressed={toolOption(state, active) === o.id}
              onClick={() => onChange({ ...state, options: { ...state.options, [active.id]: o.id } })}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      <div class="group">
        {COLORS.map((c) => (
          <button
            key={c.value}
            class="swatch"
            aria-label={c.name}
            aria-pressed={state.color === c.value}
            style={{ background: c.value }}
            onClick={() => onChange({ ...state, color: c.value })}
          />
        ))}
      </div>
      <div class="group">
        {WIDTH_LABELS.map((label, i) => (
          <button key={label} aria-pressed={state.widthIdx === i} onClick={() => onChange({ ...state, widthIdx: i })}>
            {label}
          </button>
        ))}
      </div>
      <div class="group">
        <button disabled={!canUndo} onClick={onUndo}>
          復原
        </button>
        <button disabled={!canRedo} onClick={onRedo}>
          重做
        </button>
      </div>
      {children}
    </div>
  );
}
