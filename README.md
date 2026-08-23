# BankTW 打王報名系統 — 部署說明（Workers 版）

Cloudflare 最近把 Workers 和 Pages 整合成同一套系統了，所以這個版本改用 Cloudflare
現在預設、也是官方建議的架構：**一個 Worker + 靜態網頁檔案**，不再用舊的
「Pages Functions」資料夾結構。功能完全一樣，只是程式檔案的組織方式不同。

- `public/index.html` — 前端頁面（登入 / 註冊 / 填寫角色資料 / 管理員總覽），內容跟之前一樣沒變
- `src/worker.js` — 後端 API 全部寫在這一個檔案裡
- `wrangler.toml` — 設定檔，告訴 Cloudflare 怎麼組裝這個 Worker

資料一樣存在 **Cloudflare KV**。

---

## 如果你已經照舊版說明建立了 repo 和 Pages 專案

最簡單的做法：**把 GitHub 上的 repo 內容清空，換成這個新版資料夾**。

1. 到你的 GitHub repo（`banktw-boss-signup`），把裡面所有檔案都刪掉
   （或者更快：直接刪除整個 repository，重新建立一個同名的空 repo）
2. 把這個資料夾（`public/`、`src/`、`wrangler.toml`）整個上傳上去，
   記得要連同 `public` 和 `src` 兩個子資料夾一起拖曳上傳，
   保持資料夾結構（不要把裡面的檔案攤平放在根目錄）
3. 如果你剛剛在 Cloudflare 那邊已經點過一次 Deploy 失敗了也沒關係，
   等 GitHub 上的檔案換成新版之後，回到 Cloudflare 專案頁面重新觸發一次部署即可
   （Deployments 頁面裡有 "Retry deployment"，或者你剛剛推的這次 commit 會自動觸發新的部署）

---

## 第一次設定（原本卡在「Set up your application」那一頁的話）

1. 確認 GitHub 上的 repo 內容已經是新版（`public/`、`src/`、`wrangler.toml`）
2. 回到 Cloudflare「Create a Worker」設定頁面：
   - **Project name**：`banktw-boss-signup`（保持不變）
   - **Build command**：留空
   - **Deploy command**：保持預設的 `npx wrangler deploy`，**不用改**
3. 點 **Deploy**

這次因為 `wrangler.toml` 裡已經寫好 KV 綁定的名稱和你的 KV namespace ID
（我已經幫你從你的 Cloudflare 後台畫面填進去了），**KV 資料庫會自動綁定，
不用再手動去設定頁面加一次**。部署完成後可以到專案的 **Settings → Bindings**
確認有沒有看到 `BANKTW_KV` 這個綁定，如果沒有看到、或提示 KV id 不存在，
代表我幫你填的 ID 可能有誤，這時候到 Cloudflare 的 KV 頁面複製正確的 namespace ID，
貼到 `wrangler.toml` 裡 `id = "..."` 的位置，重新上傳，會自動重新部署。

---

## 設定密碼用的環境變數（這一步一定要手動做）

`wrangler.toml` 裡不能放真正的密碼（因為這個檔案在 GitHub 上是公開/半公開的），
所以這兩個要到 Cloudflare 後台手動加：

1. 部署完成後，進到這個 Worker 專案
2. 找 **Settings**，裡面應該會有 **Variables and Secrets**（新版介面可能叫這個名字，
   或是「Variables」分頁下有 Secrets 的區塊）
3. 新增兩個變數，類型都選 **Secret**（加密）：

   | 變數名稱 | 用途 | 範例值 |
   |---|---|---|
   | `SESSION_SECRET` | 用來簽發登入 token 的密鑰，隨便打一長串英數字即可 | `x8Kp2vQzR9mN4jL7wY3tF6bH1cA5sD0e` |
   | `ADMIN_PASSWORD` | 管理員總覽的登入密碼 | 你自己設定的密碼 |

4. 儲存後，回到 Deployments，觸發一次新的部署讓變數生效（改一次任何檔案 push 上去，
   或用後台的重新部署按鈕）

---

## 拿到正式網址 & 測試

部署成功後，Cloudflare 會給一個網址，長得像：

```
https://banktw-boss-signup.<你的帳號>.workers.dev
```

（新版網址結尾是 `.workers.dev`，不是舊版的 `.pages.dev`，這是正常的）

打開網址測試：註冊帳號 → 填寫角色資料 → 存檔 → 登出 → 重新登入確認資料還在 →
用「管理員登入」+ 剛設定的 `ADMIN_PASSWORD` 確認總覽看得到資料。

---

## 分享到 Discord

一切正常後，把網址貼到 Discord 頻道即可。管理員密碼只私下告訴需要看總覽的幹部。

## 之後要改內容怎麼辦？

直接改 `public/index.html`（前端）或 `src/worker.js`（後端邏輯），
push 到 GitHub 的 main 分支，Cloudflare 會自動重新部署。
