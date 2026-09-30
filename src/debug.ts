// ?debug=1 時才載入 eruda（打包成獨立 chunk，不走 CDN）
export async function loadDebugTools(search: string): Promise<boolean> {
  if (new URLSearchParams(search).get('debug') !== '1') return false;
  const { default: eruda } = await import('eruda');
  eruda.init();
  return true;
}
