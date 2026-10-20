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
2. 進 SQL Editor，依序貼上並執行 `supabase/migrations/` 裡的每個檔案（0001 → 0017，都可重複執行）：
   - `0001_init.sql`：`profiles`、`legacy_import`、RLS 政策與 `handle_new_user` 觸發器
   - `0002_migration_notice.sql`：舊使用者第一次登入的遷移提示
   - `0003_ensure_profile.sql`：登入時自動建立 profile、接回舊資料
   - `0004_login_info.sql`：最後登入時間 / IP / 裝置
   - `0005_totp_item_ids.sql`：每筆 TOTP 補上 id
   - `0006_totp_rpc.sql`：新增 / 修改 / 刪除 / 排序改在資料庫裡完成，兩個裝置同時操作不會互蓋
   - `0007_vault.sql`：使用者自行啟用的金鑰加密
   - `0008_accounts.sql`：使用者 @ID；驗證碼從 `profiles.totp` 搬到 `totp_accounts` / `totp_secrets` 兩張表
     （原本的資料會自動搬過去，之後寫進 `profiles.totp` 的舊資料也會自動轉存）
   - `0009_groups_permissions.sql`：全站身分組與後台、群組（成員、身分組、邀請、單筆驗證碼權限覆寫）、操作紀錄。
     執行時會把 `marryhan25648@gmail.com` 設為「管理員」（還沒註冊的話，第一次登入時自動套用）
   - `0010_security_fixes.sql`：安全性修正（規則細節見 `docs/groups-and-permissions.md` 第 6 節）：
     - email **驗證過**才接回 `legacy_import` 舊資料、套用 `site_pending_roles`、比對 Email 邀請（未驗證的先保留，之後登入時再套）
     - 使用者只能直接改 `profiles` 的名稱、大頭照、背景、電話等顯示欄位；email、驗證狀態、加密設定、@ID、登入紀錄等只能走 RPC / 後端
     - 改加密密碼時比對舊的 `check`，兩台裝置同時改會擋下後到的那個；已啟用加密時不能存入明文金鑰
       （`totp_set_vault` 多了第三個參數 `expected_check`，舊的兩個參數版本會被刪掉，**要和新版前端一起部署**）
     - 全站只有「最高位身分組的持有者」不受階層限制；後台看 / 改 / 刪別人的 2FA 也要遵守階層
     - 指派身分組、設定驗證碼覆寫時，不能給出（或拿掉）自己沒有的權限
     - 邀請碼改成 16 碼安全亂數、有效時間預設 7 天且最長 30 天；成員離開或被踢時撤銷他建立的邀請
     - 群組成員的 email 只給有「移除成員」或「管理身分組」的人看
     - 會嘗試啟用 `pgcrypto`（Supabase 預設已安裝在 `extensions` schema）
   - `0011_default_group.sql`：「我的驗證碼」改成**預設群組**、加密改成套用在群組上（規則見 `docs/groups-and-permissions.md` 第 7 節）：
     - 每個使用者建立一個名為「我的」的預設群組（`profiles.default_group_id`），原本的個人驗證碼整批搬進去
       （順序、釘選、類別、金鑰都不動）；之後 `totp_accounts.owner_id` 一律為 null（加 check 約束）
     - 原本有啟用加密（`profiles.vault`）的使用者，預設群組標成「已加密」（金鑰本來就是密文，直接搬）
     - 新使用者建立 profile 時自動建立「我的」；從 Firebase 接回的舊資料直接放進預設群組
     - 加密的群組只能有擁有者一個成員，不能邀請；刪除帳號時只有自己一個人的群組會一起刪除
   - `0012_user_public.sql`：別人的個人頁面（`/u/[id]`）用的 `user_public`：只回傳名稱、@ID、大頭照、建立時間、全站身分組與共同群組（不含 email、電話、登入紀錄、驗證碼）
   - `0013_username_rules.sql`：個人頁面網址改用 @ID（`/u/<username>`），新增 `user_public_by_username`；@ID 不能看起來像 UUID（32 位十六進位）或和網站路由同名（me、api、groups、invite、settings、new…），已在用的不會被清掉，之後改 @ID 時才檢查
   - `0014_activity_log.sql`：使用者的登入紀錄與帳號操作紀錄：
     - 新表 `login_history`：每次登入一筆（時間、IP、裝置、user-agent、登入方式），由 `/api/record-login` 寫入
     - 帳號變更沿用 `audit_logs`（`target_type = 'user'`），由資料庫觸發器 / RPC 寫入：@ID、名稱、大頭照、背景、電話、email、
       金鑰加密（啟用 / 改密碼 / 停用 / 忘記密碼重設）、預設群組；登入時自動套用的全站身分組也會記一筆
     - 本人在「個人頁面」與 `/me/activity` 看得到自己的紀錄（含管理員查看 / 修改 / 刪除他的 2FA、身分組變更、加入 / 離開 / 被移出群組）；
       後台有「查看使用者」的人在使用者頁看得到，有「查看操作紀錄」的人在全站操作紀錄看得到帳號變更
     - 後台看比自己高（或同階）的人時，登入 IP 一律不顯示（含使用者列表的最後登入 IP）
     - 先執行 0014 再部署前端：舊版前端照常可用（只是不會寫入 `login_history`）；新版前端若先上線，紀錄區塊會提示「請先執行 0014」，登入時只會更新最後登入資訊
   - `0015_default_group_name.sql`：預設群組改用使用者名稱命名：
     - 新建的預設群組叫「<名稱>的群組」（例如「Andy的群組」），名稱依序取：名稱 → @ID → email 的 @ 前段，都沒有用「我的群組」；超過 50 字只截名稱、保留「的群組」
     - 既有的預設群組若名稱仍是「我的」，改成新規則的名稱（使用者自己改過名的不動），每個群組的操作紀錄記一筆「修改群組資料」（操作者為系統）；重複執行不會再改
     - 只改資料庫，前端不需要一起部署
   - `0016_group_order.sql`：每個人自己排群組順序（`group_members.position`，只影響自己看到的順序）：既有資料照原本順序編號（預設群組在最前）、新加入的群組排最後、`my_groups` 依此排序、新增 `my_groups_reorder`；沒執行前「調整順序」會失敗並復原，其他照常
   - `0017_admin_add_member.sql`：全站管理員直接把使用者加進群組（不用邀請）：
     - 新增 `group_add_member(gid, target)`：target 是電子郵件、@ID（可帶 @）或使用者 ID；只有全站「管理所有群組」或「管理員」能用，群組內的管理者照舊用邀請
     - 擋下：找不到使用者、已經是成員、加密的群組、電子郵件還沒驗證的帳號
     - 加入後只有 @everyone 的權限、群組排在對方清單最後，並刪掉對方在這個群組待回覆的 Email 邀請；群組操作紀錄記 `group.member.add`，對方的帳號操作紀錄也看得到「管理員 X 把你加入群組「…」」
     - 沒執行前「新增成員」會提示先執行 0017，其他照常

> **部署新版前端前，必須先執行 0008、0009**，否則驗證碼頁會顯示錯誤
> （「資料庫還沒更新，請先在 Supabase 執行 0008_accounts.sql。」），群組與後台也無法使用。
> 0008、0009 會自己補上 0002 / 0004 / 0007 加的 profiles 欄位，所以就算中間幾個檔案漏跑，也能直接執行。

> **0011 會搬資料而且不可逆**（之後沒有「個人驗證碼」這條路徑），執行前請先在 Supabase 後台備份資料庫
> （Database → Backups，或 `pg_dump` 至少備份 `profiles`、`totp_accounts`、`totp_secrets`、`groups`）。
> **0011 要和新版前端一起部署**：舊版前端的驗證碼頁仍可透過相容的 `totp_*` RPC 讀寫預設群組，
> 但舊版的「啟用加密」不會加密任何群組（加密改由群組設定切換），請盡快換上新版前端。
> 建議順序：備份 → 執行 0011 → 部署前端（中間空窗越短越好）。

> **0010 之後請到 Supabase 後台確認**：Authentication → Providers → Email。
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
