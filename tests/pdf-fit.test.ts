import { describe, expect, it } from 'vitest';
import { pdfFit } from '../src/pdf/fit';

describe('pdfFit', () => {
  it('A4 頁剛好填滿', () => {
    expect(pdfFit(595, 842)).toEqual({ x: 0, y: 0, w: 595, h: 842 });
  });

  it('Letter 縮放到 A4 寬度、靠上對齊', () => {
    const b = pdfFit(612, 792);
    expect(b.x).toBeCloseTo(0);
    expect(b.y).toBe(0);
    expect(b.w).toBeCloseTo(595);
    expect(b.h).toBeCloseTo((792 * 595) / 612);
  });

  it('橫向頁縮放到 A4 寬度，下方留白', () => {
    const b = pdfFit(842, 595);
    expect(b.w).toBeCloseTo(595);
    expect(b.h).toBeCloseTo((595 * 595) / 842);
    expect(b.y).toBe(0);
  });

  it('比 A4 瘦長的頁面整頁放得下並水平置中', () => {
    const b = pdfFit(200, 1000);
    expect(b.h).toBeCloseTo(842);
    expect(b.w).toBeCloseTo(168.4);
    expect(b.x).toBeCloseTo((595 - 168.4) / 2);
    expect(b.y).toBe(0);
  });
});
