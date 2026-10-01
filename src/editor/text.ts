import type { TextElement } from '../db/schema';
import { TEXT_LINE_HEIGHT } from './geometry';

/** 依寬度斷行（逐字，中文沒有空白可以斷）；保留原本的換行 */
export function wrapText(measure: (s: string) => number, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const ch of para) {
      if (line && measure(line + ch) > maxWidth) {
        lines.push(line);
        line = ch;
      } else line += ch;
    }
    lines.push(line);
  }
  return lines;
}

/** 在 canvas 上畫文字（縮圖用；頁面上的文字由 overlay 的 DOM 顯示） */
export function drawText(ctx: CanvasRenderingContext2D, el: TextElement, scale: number): void {
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.font = `${el.fontSize}px -apple-system, "PingFang TC", "Noto Sans TC", sans-serif`;
  ctx.fillStyle = el.color;
  ctx.textBaseline = 'middle';
  const lh = el.fontSize * TEXT_LINE_HEIGHT;
  wrapText((s) => ctx.measureText(s).width, el.content, el.w).forEach((line, i) => {
    ctx.fillText(line, el.x, el.y + lh * (i + 0.5));
  });
  ctx.restore();
}

let proxy: HTMLTextAreaElement | null = null;

/**
 * iOS 只有在使用者操作的事件裡 focus 才會叫出鍵盤，但文字框要等下一次 render 才出現；
 * 先 focus 一個隱藏的輸入框把鍵盤叫出來，文字框出現後再把 focus 移過去。
 */
export function focusProxy(): void {
  if (!proxy) {
    proxy = document.createElement('textarea');
    proxy.className = 'focus-proxy';
    proxy.setAttribute('aria-hidden', 'true');
    proxy.tabIndex = -1;
    document.body.append(proxy);
  }
  proxy.focus({ preventScroll: true });
}

/** 結束目前的文字編輯（觸發 blur 存檔） */
export function blurEditing(): void {
  const active = document.activeElement as HTMLElement | null;
  if (active?.isContentEditable) active.blur();
}
