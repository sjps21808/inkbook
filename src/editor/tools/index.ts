import type { StrokeElement } from '../../db/schema';

/** 工具列由這個陣列產生；新增工具時在陣列尾端加一項（CLAUDE.md §6） */
export interface ToolDef {
  id: string;
  label: string;
  stroke: StrokeElement['tool'];
  /** 細／中／粗（pt） */
  widths: [number, number, number];
}

export const tools: ToolDef[] = [
  { id: 'pen', label: '筆', stroke: 'pen', widths: [1.5, 3, 5] },
  { id: 'highlighter', label: '螢光筆', stroke: 'highlighter', widths: [8, 14, 20] },
];

export const COLORS: { name: string; value: string }[] = [
  { name: '黑', value: '#1c1c1e' },
  { name: '灰', value: '#8e8e93' },
  { name: '紅', value: '#e53935' },
  { name: '橙', value: '#fb8c00' },
  { name: '黃', value: '#fdd835' },
  { name: '綠', value: '#43a047' },
  { name: '藍', value: '#1e88e5' },
  { name: '紫', value: '#8e24aa' },
];

export const WIDTH_LABELS = ['細', '中', '粗'] as const;
