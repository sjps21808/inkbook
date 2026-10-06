import type { ComponentChildren } from 'preact';
import { QUICK_TOOLS } from './QuickBar';
import { tools, type ToolDef } from './tools';

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
  /** 點一次性動作的工具（例如圖片） */
  onAction(tool: ToolDef): void;
  /** 工具列尾端的其他按鈕（頁面操作） */
  children?: ComponentChildren;
}

/** 大選單（☰ 拉出）：浮動快捷列以外的工具與頁面操作 */
export function Toolbar(props: Props) {
  const { title, onBack, state, onChange, onAction, children } = props;
  const active = tools.find((t) => t.id === state.toolId)!;
  return (
    <div class="toolbar" role="toolbar" aria-label="工具列">
      <div class="group">
        <button onClick={onBack}>‹ 書架</button>
        <span class="nb-title">{title}</span>
      </div>
      <div class="group">
        {tools
          .filter((t) => !QUICK_TOOLS.includes(t.id))
          .map((t) => (
          <button
            key={t.id}
            aria-pressed={t.action ? undefined : state.toolId === t.id}
            onClick={() => (t.action ? onAction(t) : onChange({ ...state, toolId: t.id }))}
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
      {children}
    </div>
  );
}
