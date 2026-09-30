import { UpdatePrompt } from './pwa/UpdatePrompt';

export function App() {
  return (
    <>
      <header class="topbar">
        <h1>InkBook</h1>
        <UpdatePrompt />
      </header>
      <main class="library">
        <p class="empty">還沒有筆記本</p>
        <p class="version">版本 {__APP_VERSION__}</p>
      </main>
    </>
  );
}
