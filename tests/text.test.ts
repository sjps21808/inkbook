import { describe, expect, it } from 'vitest';
import { wrapText } from '../src/editor/text';

const measure = (s: string) => s.length * 10;

describe('wrapText', () => {
  it('超過寬度時逐字斷行', () => {
    expect(wrapText(measure, '一二三四五', 30)).toEqual(['一二三', '四五']);
  });

  it('保留原本的換行與空行', () => {
    expect(wrapText(measure, 'ab\n\ncd', 100)).toEqual(['ab', '', 'cd']);
  });

  it('單一字元比寬度還寬時仍放在同一行', () => {
    expect(wrapText(measure, 'ab', 5)).toEqual(['a', 'b']);
  });
});
