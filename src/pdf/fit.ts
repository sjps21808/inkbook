import { PAGE_HEIGHT, PAGE_WIDTH } from '../db/schema';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * PDF 頁在 A4 頁面（pt）中的位置：等比例縮放到 A4 寬度、靠上對齊；
 * 縮放後比 A4 還高時改成整頁放得下並水平置中（2026-10-01 使用者決定，避免內容被裁掉）
 */
export function pdfFit(srcWidth: number, srcHeight: number): Box {
  const k = Math.min(PAGE_WIDTH / srcWidth, PAGE_HEIGHT / srcHeight);
  const w = srcWidth * k;
  const h = srcHeight * k;
  return { x: (PAGE_WIDTH - w) / 2, y: 0, w, h };
}
