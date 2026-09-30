# InkBook 啟動指令

完整規格與規則在 `CLAUDE.md`，Claude Code 開啟時會自動讀取。每次只要從下面挑一段貼上就好。

---

## ① 依序進行的里程碑（M-1、M0、M1、M2、M3、M7）
在 `D:\goodnote` 開啟 Claude Code，貼上：

```
開始 {{MILESTONE}}。嚴格遵守 CLAUDE.md：
先檢查 §8 的前置 tag，再把任務拆成小任務並列給我確認，確認後才動工。
每個小任務都要有測試並全部通過，然後各自 commit。
完成後依照 §9 回報，交出 iPad 檢查清單，並詢問我是否要 push。
```
> M-1 例外：一樣在 `D:\goodnote` 開啟（才會讀到 CLAUDE.md），但程式碼建立在 `D:\goodnote-spike`。不需要測試和 commit，做完後告訴我怎麼在 iPad 上開啟。

## ② 並行里程碑（M4 / M5 / M6，最多 3 個視窗）
在 `D:\goodnote` 開啟 Claude Code，貼上（每個視窗換一個 `{{MILESTONE}}`）：

```
開始 {{MILESTONE}}，這是並行里程碑。嚴格遵守 CLAUDE.md §6：
如果 worktree 還不存在，就依照 §6 建立並執行 npm ci，之後所有工作都只在該 worktree 內進行，並使用它專屬的 port。
不可以修改 schema、套件和 CLAUDE.md；共用插槽只能新增項目。
先檢查 §8 的前置 tag，拆成小任務列給我確認後才動工。每個小任務開始前先 rebase main。
完成後依照 §9 回報，並詢問我是否要依照 §6 的流程合併。
```

## ③ iPad 實測通過，打 tag
在原本那個里程碑的視窗貼上：

```
{{MILESTONE}} 在 iPad 上實測通過。請確認分支已經合併進 main，然後在 main 打 tag {{milestone}}-done，並詢問我是否要 push tag。
```
> M-1 通過時改成：「M-1 通過，我的感受是：______。請記錄到 CLAUDE.md §10。」（M-1 沒有 tag，M0 會 commit 這段紀錄）

## ④ iPad 實測不合格
```
{{MILESTONE}} 實測不合格：______（描述操作步驟與實際看到的狀況）。
請依照 CLAUDE.md §4 修正，每個修正都要有測試和 commit，然後重新交一份檢查清單。
```

---

## 開始前的準備
- [ ] M-1 前：iPad 與電腦連同一個 Wi-Fi
- [ ] M1 前：在 GitHub 網頁建立**空的 public repo `inkbook`**（不要勾選 README）
- [ ] M1 前：repo → Settings → Pages → Source 選擇 **GitHub Actions**
- [ ] 建議：GitHub → Settings → Emails 勾選「Keep my email address private」與「Block command line pushes that expose my email」
