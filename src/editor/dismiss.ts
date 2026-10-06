import type { RefObject } from 'preact';
import { useLayoutEffect } from 'preact/hooks';

/** 彈出選單開著時，點到 ref 以外的地方就關閉 */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  // layout effect：選單一出現就掛上監聽（useEffect 要等繪製後，太快點外面會關不掉）
  useLayoutEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);
}
