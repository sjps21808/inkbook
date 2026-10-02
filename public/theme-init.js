// 在 <body> 解析之前套用外觀設定（邏輯與 key 要和 src/theme.ts 一致）。
// 放在 <head> 同步執行，避免啟動時先閃一下另一種配色
try {
  var t = localStorage.getItem('inkbook.theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) {}
