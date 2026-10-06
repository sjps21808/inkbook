import { useRef, useState } from 'preact/hooks';
import { useDismiss } from './dismiss';
import { COLORS } from './tools';

interface Props {
  value: string;
  onChange(color: string): void;
}

/** 目前顏色的圓圈；點了跳出 4×4 色盤，選一個或點外面就關閉 */
export function ColorPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useDismiss(ref, open, () => setOpen(false));

  const name = COLORS.find((c) => c.value === value)?.name ?? '';
  return (
    <div class="color-picker" ref={ref}>
      <button
        class="swatch"
        aria-label={`顏色：${name}`}
        aria-expanded={open}
        style={{ background: value }}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div class="color-grid" role="group" aria-label="選擇顏色">
          {COLORS.map((c) => (
            <button
              key={c.value}
              class="swatch"
              aria-label={c.name}
              aria-pressed={c.value === value}
              style={{ background: c.value }}
              onClick={() => {
                onChange(c.value);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
