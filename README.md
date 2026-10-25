# Securibit 兩步驟驗證器（網站）

<p align="center">
    <img src="public/imgs/logo.png" width="120"></img>
</p>
<p align="center">
    <a href="https://2fa.bityo.tw">2fa.bityo.tw</a> ·
    <a href="https://github.com/Securibit/Securibit-Web">GitHub</a> ·
    <a href="https://github.com/Securibit/Securibit-APP">App</a> ·
    <a href="#授權">CC BY-NC 4.0</a>
</p>

<p align="center">
    <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" />
    <img alt="React" src="https://img.shields.io/badge/React-19-149eca?logo=react" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6-3178c6?logo=typescript" />
    <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss&logoColor=white" />
    <img alt="Supabase" src="https://img.shields.io/badge/Supabase-3fcf8e?logo=supabase&logoColor=white" />
    <img alt="HeroUI" src="https://img.shields.io/badge/HeroUI-2-9353d3" />
    <img alt="License" src="https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey" />
</p>

可以多人共用的 TOTP 兩步驟驗證器。驗證碼放在群組裡，用身分組決定誰能看、能改什麼；也可以設定加密密碼，讓金鑰只在自己的裝置上解開。

原本後端使用 Firebase（Auth + Firestore），2026/06/18 改為 Supabase（PostgreSQL + Auth + RLS）。網站和 [Securibit App](https://github.com/Securibit/Securibit-APP)（iOS、Android、macOS、Windows、Linux）共用同一個 Supabase，在網站改的資料 App 馬上看得到。

## 功能

- **驗證碼**
  - 手動輸入、貼上 `otpauth://` 連結、掃描或上傳 QR Code
  - 整批匯入 Google Authenticator 的轉移 QR Code 與文字備份
  - 位數、週期、演算法可以自訂
  - 搜尋、類別篩選、調整順序
  - 匯出成 QR Code 或文字備份
- **群組**
  - 每個人都有一個預設群組，也可以建立群組和別人共用
  - 用 Email、使用者 ID 或邀請連結邀請成員
  - 類似 Discord 的權限：身分組可以疊加、有上下階層，單筆驗證碼可以再對身分組或成員個別允許、拒絕
  - 群組操作紀錄
- **加密**：設定加密密碼後，加密群組的金鑰在瀏覽器裡加解密，資料庫只存密文
- **帳號**
  - Google 登入
  - 使用者 ID、個人頁、登入紀錄與帳號操作紀錄
  - 已登入的裝置：可以登出單一裝置或其他所有裝置
- **後台**：管理使用者、全站身分組與權限、所有群組，以及全站操作紀錄
- **通知**：鈴鐺收件匣（系統、帳戶、功能三類）、每種通知可以自己開關；後台可以依身分組、平台、裝置、版本發公告，並設定 App 的最低版本；Android App 收得到推播
- **即時同步**：群組、邀請與驗證碼有變動時，網站和 App 自動更新
- **App 下載頁**：讀取 App 在 GitHub 的最新 Release，依訪客的平台排序

## Skills
| Items | Content |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19 |
| Lang | TypeScript |
| CSS | Tailwind CSS 4 |
| UI | HeroUI, react-hot-toast, Framer Motion, Swiper |
| DB / Auth | Supabase (PostgreSQL + Auth + RLS + Realtime) |
| 2FA | totp-generator |
| QR Code | jsQR（讀取）, qrcode（產生） |
| Package Manager | pnpm |
| Deploy | Vercel |

## Installation
### 1. Supabase
1. 到 [Supabase](https://supabase.com) 建立專案。
2. 到 **SQL Editor** 貼上並執行 [`database/init.sql`](./database/init.sql)，一次建好所有資料表、函式、RLS 與即時同步。這個檔案只給全新的專案執行一次。
3. 到 **Authentication → Sign In / Providers → Google** 開啟 Google 登入，填入自己在 [Google Cloud Console](https://console.cloud.google.com/) 建的「網頁應用程式」OAuth 用戶端 ID 與密鑰。
4. 到 **Authentication → URL Configuration**：
   - **Site URL** 填網站網址。
   - **Redirect URLs** 加入 `https://<你的網域>/auth/callback`；本機開發另外加 `http://localhost:3000/auth/callback`。
5. 第一個管理員的設定方式寫在 `database/init.sql` 最後面。

### 2. env
```bash
NEXT_PUBLIC_SUPABASE_URL=https://<proj_name>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_public_key>
# 僅後端使用（刪除帳號、記錄登入、群組驗證碼、後台 API），切勿外洩
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
```

### 3. 推播（選用）
資料庫有新的通知時，用 `pg_net` 呼叫 Edge Function [`edge-functions/push/index.ts`](./edge-functions/push/index.ts)，由它透過 Firebase Cloud Messaging 推播到 Android App。沒設定的話鈴鐺照常可用，只是不會推播。

1. **Edge Function**：Dashboard → **Edge Functions** → 新增函式，名稱 `push`，貼上 `edge-functions/push/index.ts` 的內容後部署；在函式設定把 **Verify JWT 關掉**（改由資料庫帶的 `x-push-secret` 驗證）。
2. **Secrets**：Edge Functions → **Secrets** 新增 `FCM_SERVICE_ACCOUNT`，值是 Firebase 服務帳戶的整個 JSON（Firebase Console → 專案設定 → 服務帳戶 → 產生新的私密金鑰）。`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 由 Supabase 自動提供。
3. **Vault**：`init.sql`（或 migration 0024）已經在 Vault 產生 `push_webhook_secret`。專案網址請自己在 SQL Editor 執行一次（網址不進 repo）：
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
   ```
4. **補送（建議）**：Database → **Extensions** 開啟 `pg_cron` 後執行下面這行，每分鐘補送沒送出去的推播（先開好 `pg_cron` 再跑 `init.sql` 的話會自動排好）：
   ```sql
   select cron.schedule('securibit-push-retry', '* * * * *', 'select public.push_retry()');
   ```

服務帳戶 JSON、Vault 的值都不要放進 repo。

### 4. start
```bash
pnpm i
pnpm dev
pnpm build && pnpm start
```

群組與權限的規則見 [`docs/groups-and-permissions.md`](./docs/groups-and-permissions.md)；Firebase 舊資料的搬移紀錄見 [`MIGRATION.md`](./MIGRATION.md)。

## 開發者
由幣友 BITYO 與靈魂之神工作室共同開發。

- 夏特稀 — <https://github.com/mmm25002500>
- 糖豆魚 — <https://github.com/PTDTW>

## 貢獻
有問題就開 issue。要改東西的話 fork 出去開分支發 PR，commit 訊息寫清楚、確認 `pnpm build` 過得了再丟。
動樣式請用 Tailwind，沿用 `tailwind.config.ts` 既有的設計 token，別改到原本的版面。

## 授權
採用 [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/deed.zh-Hant)，完整條款見 [`LICENSE`](./LICENSE)。
可自由使用、改作、學習，但**不能商用**，且**要標明來源**（TershiXia／幣友 BITYO／靈魂之神工作室）。

© 2026 TershiXia · 幣友 BITYO 🤝 靈魂之神工作室
