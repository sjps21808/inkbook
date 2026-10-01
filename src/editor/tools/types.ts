import type { InkDatabase } from '../../db/db';
import type { PageElement, TextElement } from '../../db/schema';

/** 頁面座標（pt） */
export interface Point {
  x: number;
  y: number;
  pressure: number;
}

/** 工具在某一頁上能使用的功能（由 PageCanvas 提供） */
export interface ToolContext {
  pageId: string;
  /** 已存檔的 element（不含預覽） */
  elements: PageElement[];
  color: string;
  /** 選單粗細對應到這個工具 widths 的值 */
  width: number;
  /** 目前選擇的工具選項 id（工具沒有 options 時為 undefined） */
  option: string | undefined;
  /** 1 個 CSS px 等於幾 pt */
  ptPerPx: number;
  /** 暫時用 els 取代畫面上的 element；null = 恢復 */
  preview(els: PageElement[] | null): void;
  /** 清空 live 圖層後用 draw 重畫（座標 pt）；null = 只清空 */
  drawLive(draw: ((ctx: CanvasRenderingContext2D) => void) | null): void;
  /** 寫入一個可以 undo 的動作（預覽在寫入完成後自動清除） */
  commit(added: PageElement[], removed: PageElement[]): void;
  /** 這一頁目前選取的 element id */
  selection: string[];
  select(ids: string[]): void;
  /** 開始編輯文字框（不在 elements 裡 = 新的文字框，失焦時有內容才存檔） */
  editText(el: TextElement): void;
}

/** 一次性動作（點工具按鈕時執行）能使用的功能 */
export interface ActionContext {
  db: InkDatabase;
  /** 畫面中間的那一頁 */
  pageId: string;
  /** 該頁下一個可用的 z */
  nextZ: number;
  /** 新增 element（可以 undo），並切換到套索選取它們 */
  insert(els: PageElement[]): void;
}

/** 一次筆的拖曳（pointerdown → pointerup） */
export interface ToolSession {
  move(p: Point): void;
  up(p: Point): void;
}
