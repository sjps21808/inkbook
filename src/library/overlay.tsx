import { render, type VNode } from 'preact';

/** 在 body 上顯示一個獨立的對話框（給 actions 這類沒有 UI 的程式使用） */
export function showOverlay(build: (close: () => void) => VNode): void {
  const host = document.createElement('div');
  // 編輯頁放大時對話框也不跟著放大（見 editor/hud.ts）
  host.className = 'hud';
  document.body.appendChild(host);
  const close = () => {
    render(null, host);
    host.remove();
  };
  render(build(close), host);
}
