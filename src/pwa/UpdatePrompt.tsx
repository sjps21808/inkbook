import { useRegisterSW } from 'virtual:pwa-register/preact';

// 有新版時顯示按鈕，使用者點擊才套用（不自動重新載入）
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // iPad 的主畫面 App 常從背景恢復而不重新導覽，回到前景時主動檢查更新
      if (!registration) return;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update();
      });
    },
  });

  if (!needRefresh) return null;
  return (
    <button class="update-btn" onClick={() => updateServiceWorker(true)}>
      有新版本
    </button>
  );
}
