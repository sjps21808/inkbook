# InkBook — 專案規則與規格

類似 GoodNotes、給 iPad + Apple Pencil 使用的手寫筆記 PWA。本檔案是唯一的規格來源，每個 session 都要遵守。
所有回報一律使用繁體中文；UI 語言也是繁體中文。

## 1. 背景與不可改變的前提
- 開發者只有 Windows，沒有 Mac，也不付費 → 採用 PWA，部署到 GitHub Pages，iPad 用 Safari「加入主畫面」後使用。
- **筆記資料只存在 iPad 本機的 IndexedDB**，不上傳。App 不能呼叫任何外部 API，也不能接 analytics。
- CSP：`default-src 'self'`，只為 pdf.js worker 和 `blob:` 放行必要的來源；`script-src` 另加 `'wasm-unsafe-eval'`，只允許編譯 WebAssembly（pdf.js 的 JBIG2、JPEG2000 解碼器與色彩管理），仍然禁止 JS `eval`（2026-10-01 使用者同意）。
- **必須能完全離線**：第一次載入後，飛航模式下也能開啟、新增筆記、書寫、匯出。
- 目標裝置：iPadOS 17 以上，以 4GB RAM 的 iPad 為最低標準。
- 網址：`https://sjps21808.github.io/inkbook/`
- 🔒 **鐵則：上線後不可以修改 Vite `base`（`/inkbook/`）、repo 名稱 `inkbook`、manifest `id` 與 `scope`。** 網址一改，iPad 會把它當成另一個 App，舊筆記會全部讀不到。

## 2. 技術與套件白名單
只能安裝下列套件。需要其他套件時，**先停下來問使用者**，並說明用途、每週下載量和授權。

| 用途 | 套件 |
|---|---|
| 建置 / UI | vite, typescript, preact, @preact/preset-vite |
| PWA | vite-plugin-pwa |
| 繪圖 | perfect-freehand |
| PDF | pdfjs-dist, pdf-lib, @pdf-lib/fontkit |
| 儲存 / 備份 | idb, fflate |
| 除錯 | eruda（只在 `?debug=1` 時動態 import，一起打包，不走 CDN） |
| 測試 | vitest, jsdom, fake-indexeddb, @playwright/test |
| Git hook | simple-git-hooks |

- 字型：Noto Sans TC Regular 的**靜態 TTF**（OFL 授權），放在 `public/fonts/`，檔案本身要 commit。
- `.npmrc`：`save-exact=true`；`package-lock.json` 要 commit；CI 用 `npm ci`。
- **M0 一次安裝全部白名單套件。M0 之後，除非使用者同意，否則不可新增或升級套件**（避免 lockfile 衝突）。

## 3. Git 設定與規則
- repo 內的身分（`--local`）：`user.name = sjps21808`，`user.email = 200869154+sjps21808@users.noreply.github.com`。不可以修改全域設定。
- `.gitattributes`：`* text=auto eol=lf`；二進位檔（ttf、png、pdf）標記 `binary`。
- 遠端：`https://github.com/sjps21808/inkbook.git`，push 時使用 Git Credential Manager（不用 gh）。
- Commit 訊息使用 Conventional Commits（例如 `feat(editor): add highlighter tool`），**一個 commit 只做一個小任務**。
- pre-commit hook 執行 `npm run check`（= `tsc --noEmit` + `vitest run`）。**禁止使用 `--no-verify`。**
- **禁止在未經使用者同意下 `git push`、`git reset --hard`、`git push --force`，或刪除分支和 tag。**

## 4. 開發工作流程（每個 session 都要遵守）
1. **開始前**：執行 `git log --oneline -20` 和 `git tag`，確認前置里程碑的 tag 都存在（見 §8）。缺少就停止並回報。
2. **規劃**：把里程碑拆成數個可以獨立驗證的小任務，先列給使用者確認，確認後才動工。
3. **每個小任務**：
   a. 撰寫或更新測試：純邏輯用 Vitest，UI 流程用 Playwright WebKit（見 §7）。
   b. 執行 `npm run check`、`npm run build`，以及相關的 E2E，全部都要通過。
   c. 建立一個 commit。
4. **測試失敗**：要修正程式碼，**禁止刪除測試、`.skip`、放寬斷言**。同一個問題修 3 次仍然失敗，就停下來回報錯誤輸出和你的判斷。
5. **範圍**：只做目前這個里程碑。發現其他問題時寫進回報，不要順手修改。
6. **完成時**：依照 §9 回報，並詢問是否要 push。使用者同意後才 push。
7. **Tag**：只有使用者在 iPad 實測後明確說「Mx 通過」，才可以在 main 上打 `mx-done`（並行分支要先合併進 main）。實測不合格時，在同一個 session 修正（仍然要遵守第 3、4 點），再交一次檢查清單。

## 5. 里程碑與依賴
```
M-1 → M0 → M1 → M2 → M3 ─┬─ M4 ─┐
                          ├─ M5 ─┼─→ M7
                          └─ M6 ─┘
```
只有 M4、M5、M6 會並行（見 §6）。其餘里程碑依序進行。

### M-1 手感驗證（唯一不需要測試和 commit 的例外）
- 放在 `D:\goodnote-spike\`，**不放進 repo**。只做單檔頁面：一張 A4 canvas、perfect-freehand、壓感、pen 繪圖、touch 捲動與縮放。
- 在 Windows 上執行 `npx vite --host`，iPad 用 Safari 開啟 `http://<電腦區網 IP>:5173`（Windows 防火牆要允許私人網路）。
- 使用者實測：快速書寫時線條是否跟得上筆尖、手掌是否會誤畫、捲動與縮放是否順暢。
- 結果（通過或不通過，以及使用者的描述）記錄在本檔 §10。**不通過就停止整個計畫**，重新評估路線。

### M0 專案骨架
Vite + Preact + TS（strict）、安裝所有白名單套件、Vitest、Playwright（WebKit）、simple-git-hooks、`npm run check`、`.npmrc`、`.gitattributes`、git init 並設定 local 身分、eruda debug 開關、繁體中文 UI 外框。

### M1 PWA 與部署
前置條件（開始前先詢問使用者是否已經完成）：① 已在 GitHub 網頁建立空的 public repo `inkbook` ② Settings → Pages → Source 已選擇 GitHub Actions。
- manifest（`id`/`scope`/`start_url` = `/inkbook/`）、icons 192/512、apple-touch-icon 180、`display: standalone`。
- Service worker 預先快取全部資源，**包含 Noto Sans TC 字型與 pdf.js worker**（要調高 `maximumFileSizeToCacheInBytes`）。
- **提示更新**：偵測到新版時，右上角顯示「有新版本」，使用者點擊後才套用；不可以自動重新載入。
- `.github/workflows/deploy.yml`：`test` job（`npm ci` → `npm audit --audit-level=high` → `npm run check` → `npm run build` → Playwright WebKit E2E）→ `deploy` job（`needs: test`）。
- `.github/dependabot.yml`：npm 與 github-actions，每週一次，只開 PR。
- 驗收：飛航模式下從主畫面開啟可以使用；發布新版後會出現更新提示。

### M2 單頁手寫與完整資料結構
- **一次定義完整的最終 schema（§11）**，包含 M5/M6 才會用到的欄位；schema 版本 = 1；建立 migration 框架與測試。
- 筆、螢光筆、8 種顏色、3 段粗細（由選單決定，**不做壓感**，見 §10）、IndexedDB 即時存檔（pointerup 時寫入）。
- 整本筆記共用一個 undo/redo 紀錄（上限 100 步，不存進資料庫）。
- 啟動時呼叫 `navigator.storage.persist()`。

### M3 多頁、虛擬捲動、插槽
- A4 頁面**左右翻頁**（一次顯示一頁，見 §10 2026-10-05 決策）：DOM 只保留目前頁前後各 1 頁；canvas 解析度要設上限。
- 新增、刪除、拖曳排序頁面（可以 undo；undo 時自動翻到對應頁面）；四種模板；縮圖側欄（延遲產生並快取）。
- 效能 E2E：300 頁筆記本從第一頁翻到最後一頁不出錯。
- **為並行開發準備的插槽**：
  - 最小版書架（筆記本列表、新增筆記本），加上一個空的**動作列** `library/actions.ts`（陣列）
  - 工具列由 `editor/tools/index.ts` 的工具陣列產生

### M4 書架與備份（並行）
- 資料夾樹、筆記本網格（封面顏色、標題、修改時間）；新增、重新命名、移動、刪除（刪除要二次確認）。
- 備份 `.inkbak` = zip(`db.json` + `blobs/*`)，包含 schema 版本；還原時可以選擇合併或覆蓋；還原舊版本備份時要經過 migration。
- 用 `navigator.share({files})` 分享，不支援時 fallback 到 `<a download>`。
- 距離上次備份超過 7 天時，書架頂端顯示提示列。

### M5 匯入 PDF（並行）
- pdf.js 讀取 → 每頁建立 Page `{pdf:{blobId,pageNo}}`，不預先渲染；不是 A4 的頁面等比例縮放到 A4 寬度、靠上對齊；**縮放後比 A4 還高的頁面，改成整頁放得下並水平置中**（2026-10-01 使用者決定）。位置一律由 `src/pdf/fit.ts` 的 `pdfFit()` 計算，畫面與匯出共用。
- 入口：在 `library/actions.ts` 加一項。
- 上限 500 頁 / 100MB，超過時提示。效能 E2E：產生一份 500 頁 PDF，匯入要在 10 秒內完成。

### M6 編輯工具（並行）
- 橡皮擦：**局部擦除（預設）**和整筆擦除可以切換。局部擦除會把 stroke 的點陣列切成多段，undo 時要還原成原本的一筆。
- 套索：多邊形；stroke 有超過 50% 的點在範圍內就算選中；選取後可以移動、縮放、刪除、改色、複製。
- 圖片（`<input type=file accept=image/*>`）、文字框（contenteditable）。
- 每個工具在 `editor/tools/index.ts` 各加一行。

### M7 匯出 PDF、深色模式
- pdf-lib：PDF 頁用 `embedPage` 放到 A4 頁上、位置用 `pdfFit()`（2026-10-02 使用者決定，取代 `copyPages`，讓非 A4 頁與筆跡座標對齊）；模板線條用向量繪製；stroke 用 perfect-freehand outline 轉成 SVG path 後以 `drawSvgPath` 寫入；圖片嵌入；**文字嵌入 Noto Sans TC（fontkit subset）**，要能搜尋和複製。
- 測試：匯出後用 pdf-lib 或 pdf.js 解析回來，檢查頁數、文字內容可以取出。
- 深色模式：UI 預設跟隨 `prefers-color-scheme`，可以在頂端列的「外觀」選單手動指定淺色或深色（存在 `localStorage`，2026-10-03 使用者決定）；頁面維持白紙。

## 6. 並行開發（只適用 M4 ∥ M5 ∥ M6）
- `D:\goodnote` 固定在 main，只用來合併。worktree 配置：

| 目錄 | 分支 | dev / E2E port |
|---|---|---|
| `D:\goodnote-m4` | m4 | 5174 |
| `D:\goodnote-m5` | m5 | 5175 |
| `D:\goodnote-m6` | m6 | 5176 |

  建立指令：`git -C D:\goodnote worktree add D:\goodnote-m5 -b m5 main`，接著在該目錄執行 `npm ci`。port 用環境變數 `PORT` 傳給 Vite 和 Playwright 的 `webServer`。
- 並行期間的禁止事項：**修改 schema、新增或升級套件、修改 CLAUDE.md**。確實需要時，停下來問使用者；規格變更的提議先寫在分支上的 `NOTES-Mx.md`。
- 修改共用插槽（`library/actions.ts`、`editor/tools/index.ts`）時，只能**新增項目**，不可以重排或改寫既有項目。
  - 例外（2026-10-01 使用者決定）：**只有 M6** 可以在 `ToolDef` 介面上新增**選填欄位**（例如 pointer 處理、一次性動作、工具選項），以支援橡皮擦、套索、圖片、文字；既有欄位與既有項目（筆、螢光筆）不可以修改。
- 每個小任務開始前先 `git rebase main`，盡早處理衝突。
- **合併流程**（先完成的先合併）：
  1. `git rebase main`
  2. 執行完整驗證：`npm run check`、`npm run build`、全部 E2E
  3. 列出要合併的 commit，**問使用者同意**
  4. 到 `D:\goodnote` 執行 `git merge --ff-only mx`
- 衝突處理：插槽裡一兩行的衝突可以自行解決；超出這個範圍就停下來問使用者。
- 三個分支都合併、tag 都打完之後，才可以開始 M7；刪除 worktree 前要先問使用者。

## 7. 測試策略
- **Vitest（jsdom + fake-indexeddb）**：hit-test、局部擦除切割、套索判定、undo 紀錄、repo CRUD、migration（用舊版本資料升級後可以讀取）、備份 roundtrip、匯出 PDF 後解析回來比對。
- **Playwright WebKit**：用 `dispatchEvent(new PointerEvent(..., {pointerType:'pen', pressure}))` 模擬 Pencil，並抽樣 canvas 像素驗證；涵蓋書架、翻頁、匯入、匯出等流程，以及效能測試。
- **Windows 上無法驗證的項目（交給使用者在 iPad 實測，不可以宣稱已通過）**：Pencil 延遲與手感、防手掌誤觸、手指捲動與縮放、加入主畫面、離線、更新提示、`navigator.share`。
- 開發模式（`import.meta.env.DEV`）把 mouse 當成 pen。
- WebKit 的臨時 context 不能把 Blob 存進 IndexedDB；需要存 Blob 的 E2E 使用 `e2e/helpers/persistent.ts` 的 `test`。

## 8. 前置 tag 檢查表
| 要開始 | 必須存在的 tag |
|---|---|
| M0 | （§10 記錄 M-1 通過） |
| M1 | m0-done |
| M2 | m1-done |
| M3 | m2-done |
| M4 / M5 / M6 | m3-done |
| M7 | m4-done、m5-done、m6-done |

## 9. 里程碑完成時的回報格式
1. 完成的小任務與對應的 commit hash
2. 測試結果（通過數/總數，附上實際指令輸出的摘要）
3. iPad 實機檢查清單：`- [ ]` 格式，每一項都寫出具體操作和預期結果
4. 已知問題、`NOTES-Mx.md` 的內容、下一個里程碑要注意的事
5. 詢問是否要 push（並行分支則是詢問是否要合併）

回報前先自我檢查：每一項宣稱都要有實際的指令輸出支持，不確定的地方要明確標示。

## 10. 決策與實測紀錄
- M-1 結果（2026-10-01）：**通過**。iPad 經 GitHub Pages（`sjps21808/inkbook-spike`，與正式網址無關）實測：跟筆、防手掌誤觸、捲動縮放、長按與雙擊都 OK；壓感粗細變化不合格。
- 決策（2026-10-01，使用者）：**不做壓感**，線寬固定，由選單的 3 段粗細決定。schema 的 `points` 仍保留 x,y,pressure 格式（schema 不變），渲染時忽略 pressure。
- 決策（2026-10-05，使用者）：編輯頁上方選單（頂端列 + 工具列）可以收起，收起狀態存在 `localStorage`；展開時浮在頁面上方、不改變頁面大小；頁面大小讓整頁（上下緣）放得進螢幕高度。
- 決策（2026-10-05，使用者）：**頁面改成左右翻頁**，取代垂直捲動。一次顯示一頁；單指左右滑動翻頁（放開後約 200ms 滑動動畫，不跟手），雙指放大時不翻頁，Pencil 書寫中不翻頁；第一頁／最後一頁再翻只彈一下、不新增頁面；工具列有「‹ n / N ›」（收起時隱藏）；每本筆記本最後看的頁面存在 `localStorage`，重新開啟時翻到該頁。
- 決策（2026-10-05，使用者，修改上一條）：滑動門檻放寬（水平 ≥ 15px 且速度 ≥ 0.3px/ms，或水平 ≥ 40px；水平量大於垂直量；不限時間；`pointercancel` 時用最後位置判斷）。**最後一頁再往後翻（滑動或「›」）= 自動在最後新增一頁並翻過去**，模板與最後一頁相同（最後一頁是 PDF 頁時用筆記本預設模板），可以 undo；第一頁往前翻仍然只彈一下。
- 決策（2026-10-05，使用者，修改上兩條）：**翻頁改成跟手**：拖動時頁面即時跟著手指左右移動，放開後用約 280ms 的減速曲線滑到下一頁或彈回原頁。最後一頁往後拖有阻力：頁面只跟手指移動一半距離（橡皮筋），手指拖超過頁寬 20% 才會出現「＋ 新增頁面」提示並在放開時新增，快速輕撥不算；第一頁往前拖同樣有橡皮筋並彈回。
- 決策（2026-10-05，使用者，修改滑動門檻）：翻頁太敏感，加阻力：輕撥要 ≥ 30px 且 ≥ 0.5px/ms，慢拖要超過頁寬 25%；最後一頁新增頁面的門檻提高到頁寬 35%。
- 決策（2026-10-06，使用者，修改滑動門檻）：一般翻頁再加阻力：輕撥要 ≥ 100px 且 ≥ 0.8px/ms，慢拖要超過頁寬 35%；新增頁面維持 35%（且輕撥不算）。
- 決策（2026-10-07，使用者）：**編輯頁選單分成兩個**。①**浮動快捷列**（一律顯示，上方中央圓角膠囊，配色跟外觀）：☰（開關大選單；收起時有新版本顯示紅點）｜筆、螢光筆、橡皮擦、套索｜細、中、粗｜顏色圓圈｜復原、重做｜有選取時：複製選取、刪除選取。按鈕用內嵌 SVG 圖示（保留中文 aria-label）。再點一次已選中的橡皮擦，跳出「局部／整筆」小選單。②**大選單**（文字按鈕，☰ 拉出收回，預設收起，狀態存 `localStorage`）：書架、標題、圖片、文字、‹ n / N ›、頁面、匯出 PDF、新增頁面、刪除頁面、外觀、版本。右上角圓形收起按鈕移除。大選單展開時浮動列緊貼其下，收起時移到頂端。
- 決策（2026-10-07，使用者）：**顏色改為 16 色**，原 8 色色碼不變，4×4 排列：黑、深灰 `#48484a`、灰、棕 `#795548`／紅、粉紅 `#d81b60`、橙、黃／黃綠 `#7cb342`、綠、青綠 `#00897b`、天藍 `#039be5`／藍、深藍 `#3949ab`、紫、淡紫 `#ba68c8`。浮動列只顯示目前顏色的圓圈，點了跳出 4×4 面板。
- 決策（2026-10-07，使用者）：**雙指縮放時選單不跟著放大**：維持 Safari 原生縮放，大選單、浮動列、選色面板、橡皮擦小選單、縮圖側欄、對話框用 `visualViewport` 反向縮放並固定在畫面上。
- 決策（2026-10-07，使用者）：大選單開關改成實心「▼」（收起時）／「▲」（展開時）。**套索兩種模式**「自由」（預設）／「矩形」（對角拖曳），選中後再點一次跳出選單，圖示隨模式變；判斷規則不變。**橡皮擦半徑改為 6 / 10 / 30 pt**。縮放時手指在螢幕上與放開後 0.5 秒內每個 frame 同步 `.hud`。
- 決策（2026-10-07，使用者）：**頂端固定區域**＝分頁列＋快捷列，白紙從它下面開始（頁面整頁放進剩下的高度），不被蓋住；大選單從快捷列下方展開、蓋在白紙上；InkBook 名稱／版本／外觀收進大選單。
- 決策（2026-10-07，使用者）：**筆記本分頁**：從書架開啟＝新開或切到已開的分頁；「＋」回書架；× 關閉（關目前分頁時切到旁邊，全關回書架）；開著的分頁存 `localStorage`，重開 App 還在；書架頁也顯示分頁列；一次只開著目前那本，切換時保留最後頁、工具、顏色、粗細，復原紀錄清空；分頁太多可左右滑動；長按拖曳排序；筆記本改名／刪除時分頁同步。

## 11. 資料模型（schema v1，M2 一次定義完成）
座標一律使用 A4 PDF 單位 595×842 pt。
```ts
Folder   { id, name, parentId: string|null, createdAt }
Notebook { id, title, folderId: string|null, coverColor, template, createdAt, updatedAt }
Page     { id, notebookId, order, template: 'blank'|'lined'|'grid'|'dot',
           pdf?: { blobId, pageNo, srcWidth, srcHeight } }
Element  { id, pageId, z, type, ... }
  stroke { tool: 'pen'|'highlighter', color, width, points: Float32Array /* x,y,pressure */ }
  image  { blobId, x, y, w, h, rotation }
  text   { x, y, w, content, fontSize, color }
Blob     { id, data: Blob, mime }
Meta     { key, value }   // schemaVersion、lastBackupAt
```
渲染分層：`canvas.bg`（模板或 PDF）/ `canvas.ink`（已完成元素；螢光筆在最底層並用 multiply 混合）/ `canvas.live`（目前正在畫的一筆）/ `div.overlay`（文字框、選取框）。
輸入：`pen` 用來繪圖並 `preventDefault`；`touch` 單指左右滑動翻頁、雙指使用原生縮放（`touch-action: pan-x pan-y pinch-zoom`，放大後原生平移）；有 `getCoalescedEvents` 時就使用；關閉文字選取、長按選單和雙擊放大。

## 12. 已知限制（不在範圍內）
- Pencil 雙擊切換工具、Pencil Pro 擠壓手勢：Safari 收不到這些事件
- 手寫辨識與搜尋、形狀修正、iCloud 同步：v1 不做
- iOS 主畫面 App 和 Safari 分頁的儲存空間互相獨立；刪除主畫面圖示 = 刪除所有筆記
