// 每本筆記本最後用的工具、顏色、粗細：切換分頁回來時恢復（介面偏好，存在 localStorage）
import type { ToolState } from './Toolbar';
import { COLORS, tools } from './tools';

const key = (notebookId: string) => `inkbook.tool.${notebookId}`;

export const DEFAULT_TOOL: ToolState = { toolId: 'pen', color: COLORS[0].value, widthIdx: 1, options: {} };

/** 讀取；沒有紀錄或資料不合法時用預設值（筆、黑、中） */
export function loadToolState(notebookId: string): ToolState {
  try {
    const v = JSON.parse(localStorage.getItem(key(notebookId)) ?? 'null') as Partial<ToolState> | null;
    const tool = tools.find((t) => t.id === v?.toolId);
    if (!v || !tool || tool.action) return DEFAULT_TOOL;
    return {
      toolId: tool.id,
      color: COLORS.some((c) => c.value === v.color) ? v.color! : DEFAULT_TOOL.color,
      widthIdx: v.widthIdx === 0 || v.widthIdx === 1 || v.widthIdx === 2 ? v.widthIdx : DEFAULT_TOOL.widthIdx,
      options: v.options && typeof v.options === 'object' ? v.options : {},
    };
  } catch {
    return DEFAULT_TOOL;
  }
}

export function saveToolState(notebookId: string, s: ToolState): void {
  try {
    localStorage.setItem(key(notebookId), JSON.stringify(s));
  } catch {
    // 無法儲存時只影響這次使用
  }
}
