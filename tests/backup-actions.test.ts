import { afterEach, describe, expect, it, vi } from 'vitest';
import { backupFileName, shareOrDownload } from '../src/library/backupActions';

const file = () => new File([new Uint8Array([1])], 'a.inkbak');

describe('backupFileName', () => {
  it('使用本地時間', () => {
    expect(backupFileName(new Date(2026, 0, 2, 3, 4))).toBe('inkbook-20260102-0304.inkbak');
  });
});

describe('shareOrDownload', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('支援分享檔案時使用 navigator.share', async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal('navigator', { canShare: () => true, share });
    expect(await shareOrDownload(file())).toBe(true);
    expect(share).toHaveBeenCalledOnce();
  });

  it('使用者取消分享時回傳 false，不會下載', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: async () => {
        throw new DOMException('cancel', 'AbortError');
      },
    });
    expect(await shareOrDownload(file())).toBe(false);
    expect(click).not.toHaveBeenCalled();
    click.mockRestore();
  });

  it('不支援分享或分享失敗時改用 <a download>', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const names: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    vi.stubGlobal('navigator', {});
    expect(await shareOrDownload(file())).toBe(true);
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: async () => {
        throw new DOMException('no', 'NotAllowedError');
      },
    });
    expect(await shareOrDownload(file())).toBe(true);
    expect(names).toEqual(['a.inkbak', 'a.inkbak']);
    click.mockRestore();
  });
});
