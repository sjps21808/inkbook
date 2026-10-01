# M5 規格變更紀錄（待併入 CLAUDE.md）

並行期間不可以修改 CLAUDE.md，以下是 M5 期間使用者做的決定，建議 M7 開始前寫進 CLAUDE.md。

## 1. 非 A4 的 PDF 頁（2026-10-01 使用者決定）
- 規格原文：「不是 A4 的頁面等比例縮放到 A4 寬度」。
- 決定：等比例縮放到 A4 寬度、靠上對齊；**縮放後比 A4 還高的頁面，改成整頁放得下並水平置中**（避免內容被裁掉）。
- 實作：`src/pdf/fit.ts` 的 `pdfFit(srcWidth, srcHeight)`。**M7 匯出 PDF 時要使用同一個函式**定位 `copyPages` 的頁面，筆跡座標才會對得上。

## 2. CSP 加上 `'wasm-unsafe-eval'`（2026-10-01 使用者同意）
- `script-src 'self' 'wasm-unsafe-eval'`：只允許編譯 WebAssembly（pdf.js 的 JBIG2、JPEG2000 解碼器與色彩管理），仍然禁止 JS `eval`。
- 建議修改 CLAUDE.md §1 的 CSP 描述。

## 3. 其他事項（不是規格變更，供後續參考）
- pdf.js 的 cMap、標準字型、wasm、ICC 檔輸出到 `dist/pdfjs/`，並由 service worker 預先快取（離線可匯入與顯示，包含使用 CNS 預設 CMap 的中文 PDF）。
- WebKit 的臨時 context（等同無痕模式）不能把 Blob 存進 IndexedDB。需要存 Blob 的 E2E 要使用 `e2e/helpers/persistent.ts` 的 `test`（M4 備份還原、M6 圖片也會遇到）。
- 刪除筆記本（`deleteNotebook`）目前不會刪除 PDF blob，屬於 M4 的範圍。
