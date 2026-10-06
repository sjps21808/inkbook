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

/** 編輯頁開啟期間跟著縮放與平移更新 */
export function useHudViewport(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    syncViewport();
    vv?.addEventListener('resize', syncViewport);
    vv?.addEventListener('scroll', syncViewport);
    return () => {
      vv?.removeEventListener('resize', syncViewport);
      vv?.removeEventListener('scroll', syncViewport);
      for (const p of ['--vv-x', '--vv-y', '--vv-inv']) document.documentElement.style.removeProperty(p);
    };
  }, []);
}

/** 畫面上的 y（getBoundingClientRect）換成 el 所在 .hud 內的座標（放大時 .hud 縮小了 1/倍率） */
export function toHudY(el: Element, y: number): number {
  const hud = el.closest('.hud');
  if (!hud) return y;
  return (y - hud.getBoundingClientRect().top) * (window.visualViewport?.scale || 1);
}
