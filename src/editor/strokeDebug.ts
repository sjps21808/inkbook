// 除錯（?debug=1）：記住最後一筆的原始資料，讓使用者匯出給開發者重現問題（不會自動傳到任何地方）
import type { NewStroke } from './PageCanvas';

export const isDebug = () => new URLSearchParams(location.search).get('debug') === '1';

export interface StrokeDump {
  app: string;
  userAgent: string;
  devicePixelRatio: number;
  /** 書寫時白紙在畫面上的寬度（CSS px，含縮放）；1pt = pageWidthPx / 595 px */
  pageWidthPx: number;
  tool: NewStroke['tool'];
  color: string;
  width: number;
  /** 原始點（A4 pt）：x, y, pressure 依序排列 */
  points: number[];
}

let last: StrokeDump | null = null;

/** 記住這一筆（只在除錯模式） */
export function recordStroke(s: NewStroke, pageWidthPx: number): void {
  if (!isDebug()) return;
  last = {
    app: __APP_VERSION__,
    userAgent: navigator.userAgent,
    devicePixelRatio: window.devicePixelRatio,
    pageWidthPx,
    tool: s.tool,
    color: s.color,
    width: s.width,
    points: Array.from(s.points),
  };
}

/** 最後一筆的 JSON 檔；還沒畫過時是 null */
export function strokeDumpFile(): File | null {
  if (!last) return null;
  return new File([JSON.stringify(last)], 'inkbook-stroke.json', { type: 'application/json' });
}
