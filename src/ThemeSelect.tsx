import { useState } from 'preact/hooks';
import { applyTheme, loadTheme, THEMES, type Theme } from './theme';

export function ThemeSelect() {
  const [theme, setTheme] = useState(loadTheme);
  return (
    <select
      class="theme-select"
      aria-label="外觀"
      value={theme}
      onChange={(e) => {
        const t = e.currentTarget.value as Theme;
        applyTheme(t);
        setTheme(t);
      }}
    >
      {THEMES.map((t) => (
        <option key={t.id} value={t.id}>
          {t.label}
        </option>
      ))}
    </select>
  );
}
