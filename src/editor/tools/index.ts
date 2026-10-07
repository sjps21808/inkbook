import type { StrokeElement } from '../../db/schema';
import { eraserSession } from './eraser';
import { pickImage } from './image';
import { lassoSession } from './lasso';
import { textSession } from './text';
import type { ActionContext, Point, ToolContext, ToolSession } from './types';

/** 工具列由這個陣列產生；新增工具時在陣列尾端加一項（CLAUDE.md §6） */
export interface ToolDef {
  id: string;
  label: string;
  stroke: StrokeElement['tool'];
  /** 細／中／粗（pt） */
  widths: [number, number, number];
  /** 有設定時，筆在頁面上的輸入交給這個工具處理（不畫筆畫）；回傳 undefined 表示忽略這次輸入 */
  pointer?(ctx: ToolContext, at: Point): ToolSession | undefined;
  /** 工具選項（例如橡皮擦的局部／整筆）；第一項為預設 */
  options?: { id: string; label: string }[];
  /** 有設定時，按鈕是一次性動作（例如插入圖片），不會切換目前的工具 */
  action?(ctx: ActionContext): void;
}

export const tools: ToolDef[] = [
  { id: 'pen', label: '筆', stroke: 'pen', widths: [1.5, 3, 5] },
  { id: 'highlighter', label: '螢光筆', stroke: 'highlighter', widths: [8, 14, 20] },
  // widths = 橡皮擦半徑
  { id: 'eraser', label: '橡皮擦', stroke: 'pen', widths: [6, 10, 30], pointer: eraserSession, options: [{ id: 'partial', label: '局部' }, { id: 'whole', label: '整筆' }] },
  { id: 'lasso', label: '套索', stroke: 'pen', widths: [1, 1, 1], pointer: lassoSession, options: [{ id: 'free', label: '自由' }, { id: 'rect', label: '矩形' }] },
  { id: 'image', label: '圖片', stroke: 'pen', widths: [1, 1, 1], action: pickImage },
  // widths = 字級（pt）
  { id: 'text', label: '文字', stroke: 'pen', widths: [12, 16, 24], pointer: textSession },
];

/** 16 色，依 4×4 色盤的順序（原本 8 色的色碼不變，舊筆跡的顏色才對得上） */
export const COLORS: { name: string; value: string }[] = [
  { name: '黑', value: '#1c1c1e' },
  { name: '深灰', value: '#48484a' },
  { name: '灰', value: '#8e8e93' },
  { name: '棕', value: '#795548' },
  { name: '紅', value: '#e53935' },
  { name: '粉紅', value: '#d81b60' },
  { name: '橙', value: '#fb8c00' },
  { name: '黃', value: '#fdd835' },
  { name: '黃綠', value: '#7cb342' },
  { name: '綠', value: '#43a047' },
  { name: '青綠', value: '#00897b' },
  { name: '天藍', value: '#039be5' },
  { name: '藍', value: '#1e88e5' },
  { name: '深藍', value: '#3949ab' },
  { name: '紫', value: '#8e24aa' },
  { name: '淡紫', value: '#ba68c8' },
];

export const WIDTH_LABELS = ['細', '中', '粗'] as const;
