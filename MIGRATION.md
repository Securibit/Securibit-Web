# Firebase → Supabase 遷移指南

本專案已從 Firebase（Auth + Firestore）改為 Supabase（Auth + Postgres）。
以下是上線與「搬移現有 ~20 位使用者」的完整步驟。

## 為什麼用 email 對應？

Firebase 的 `uid` 和 Supabase 的使用者 `id`（uuid）**不一樣**。使用者用 Google 重新登入時，
Supabase 會配一個全新的 uuid，所以無法用 uid 對應舊資料。

唯一穩定的對應鍵是 **email**（Google 帳號的 email 不會變）。流程是：

1. 把 Firestore 的舊資料匯入 Supabase 的 `legacy_import` 暫存表（以 email 為鍵）
2. 每位使用者第一次用 Google 登入時，資料庫觸發器 `handle_new_user` 會依 email
   自動把 TOTP 等資料搬進該使用者的 `profiles`，並刪掉已用過的暫存資料

> 使用者**不需要做任何事**，只要用「原本的 Google 帳號」登入，TOTP 就會自動回來。

---

## 1. 建立 Supabase 專案與資料表

1. 在 https://supabase.com 建立專案
2. 進 SQL Editor，貼上並執行 [`database/init.sql`](./database/init.sql)，一次建好所有資料表、函式與 RLS（包含下面用到的 `legacy_import` 暫存表與 `handle_new_user` 觸發器）

> **建好資料表後請到 Supabase 後台確認**：Authentication → Providers → Email。
> 網站只用 Google 登入，建議直接**關閉 Email provider**；若要保留，務必開啟 **Confirm email**。
> 否則別人可以用你的 email 註冊（自動視為已驗證），搶走 pending 的管理員身分組或舊資料。

## 2. 設定 Google 登入

1. Supabase 後台 → Authentication → Providers → Google → 啟用
2. 填入 Google OAuth 的 Client ID / Secret
   （在 Google Cloud Console 建立 OAuth 用戶端）
3. 把 Supabase 提供的 callback URL 加進 Google OAuth 的「已授權的重新導向 URI」
4. Authentication → URL Configuration → Site URL 與 Redirect URLs
   加入你的網站網址（本機開發加 `http://localhost:3000`）

## 3. 設定環境變數

複製 `.env.local.example` 成 `.env.local`，填入：

```
NEXT_PUBLIC_SUPABASE_URL=...          # 專案設定 → API → Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=...     # 專案設定 → API → anon public key
SUPABASE_SERVICE_ROLE_KEY=...         # 專案設定 → API → service_role key（勿外洩）
```

## 4. 搬移現有使用者資料（~20 人）

> Firestore 的 `user` 文件只有 `uid` / `totp`，不一定有 `email`。匯出腳本會自動
> 從 **Firebase Authentication** 取得每個 uid 對應的 email，再跟 Firestore 的 totp join，
> 所以即使文件沒存 email 也搬得動。

**這些指令都在你電腦的「專案資料夾終端機」執行，不是在 Firebase 後台網頁。**

```bash
# (1) 下載 service account 金鑰：
#     Firebase 後台 → 左上角 ⚙️ 設定 → 「專案設定」→ 上方「服務帳戶」分頁
#     → 「產生新的私密金鑰」→ 下載 JSON → 存成專案根目錄的 ./serviceAccount.json

# (2) 從 Firebase（Auth + Firestore）匯出 → legacy-users.json
node scripts/export-firestore.mjs

# (3) 匯入 Supabase 的 legacy_import 暫存表
node --env-file=.env.local scripts/import-to-supabase.mjs
```

完成後，通知使用者用原本的 Google 帳號登入即可，資料會自動接回。

> 確認都搬完後，`legacy_import` 表裡剩下的就是「還沒登入過」的人；
> 全部登入完後該表會清空，可保留或日後刪除。

## 5. 本機驗證

```bash
pnpm dev
```

---

## 注意事項

- `serviceAccount.json`、`legacy-users.json`、`.env.local` 都含敏感資料，
  已被 `.gitignore` 忽略，**不要 commit**。
- 刪除帳號功能透過 `src/app/api/delete-account/route.ts`（service_role）執行，
  需要 `SUPABASE_SERVICE_ROLE_KEY` 才能運作。
