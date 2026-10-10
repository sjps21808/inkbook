// 在 <body> 解析之前套用外觀設定（邏輯與 key 要和 src/theme.ts 一致）。
// 放在 <head> 同步執行，避免啟動時先閃一下另一種配色。
// 沒有設定時（第一次開啟）依系統決定並儲存，之後固定
try {
  var t = localStorage.getItem('inkbook.theme');
  if (t !== 'light' && t !== 'dark') {
    t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    localStorage.setItem('inkbook.theme', t);
  }
  document.documentElement.dataset.theme = t;
} catch (e) {}
