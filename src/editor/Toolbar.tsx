import { COLORS, tools, WIDTH_LABELS } from './tools';

export interface ToolState {
  toolId: string;
  color: string;
  widthIdx: number;
}

interface Props {
  state: ToolState;
  onChange(s: ToolState): void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo(): void;
  onRedo(): void;
}

export function Toolbar({ state, onChange, canUndo, canRedo, onUndo, onRedo }: Props) {
  return (
    <div class="toolbar" role="toolbar" aria-label="工具列">
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
    </div>
  );
}
