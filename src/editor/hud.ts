// 雙指放大時選單不跟著放大：浮在頁面上的介面都包在 .hud 裡，
// 依 visualViewport 把 .hud 平移到看得到的區域並縮回 1/倍率（CSS 見 app.css html[data-chrome] .hud）
import { useEffect } from 'preact/hooks';

/** 把 visualViewport 的位移與倍率寫進 <html> 的 CSS 變數 */
export function syncViewport(): void {
  const vv = window.visualViewport;
  const root = document.documentElement.style;
  root.setProperty('--vv-x', `${vv?.offsetLeft ?? 0}px`);
  root.setProperty('--vv-y', `${vv?.offsetTop ?? 0}px`);
  root.setProperty('--vv-inv', String(1 / (vv?.scale || 1)));
}

/** 手指離開後再持續同步多久（Safari 的縮放動畫還會走一下） */
const SETTLE_MS = 500;

/**
 * 編輯頁開啟期間跟著縮放與平移更新。
 * 快速縮放時 Safari 的 visualViewport 事件不規律、最後一次可能沒送，
 * 所以手指在螢幕上與離開後 0.5 秒內，每個 frame 主動讀一次
 */
export function useHudViewport(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    let touching = false;
    let until = 0;
    let raf = 0;
    const tick = () => {
      syncViewport();
      raf = touching || performance.now() < until ? requestAnimationFrame(tick) : 0;
    };
    const start = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const down = () => {
      touching = true;
      start();
    };
    const up = (e: TouchEvent) => {
      if (e.touches.length) return;
      touching = false;
      until = performance.now() + SETTLE_MS;
      syncViewport();
      start();
    };
    syncViewport();
    vv?.addEventListener('resize', syncViewport);
    vv?.addEventListener('scroll', syncViewport);
    window.addEventListener('touchstart', down, { capture: true, passive: true });
    window.addEventListener('touchend', up, { capture: true, passive: true });
    window.addEventListener('touchcancel', up, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(raf);
      vv?.removeEventListener('resize', syncViewport);
      vv?.removeEventListener('scroll', syncViewport);
      window.removeEventListener('touchstart', down, { capture: true });
      window.removeEventListener('touchend', up, { capture: true });
      window.removeEventListener('touchcancel', up, { capture: true });
      for (const p of ['--vv-x', '--vv-y', '--vv-inv']) document.documentElement.style.removeProperty(p);
    };
  }, []);
}
