# 群組、身分組與後台：規格

這份文件是資料庫（migration 0008、0009）、資料層（`src/lib`）與畫面三邊共用的約定。
改了任何一邊的介面，都要回來更新這份文件。

## 0. 總覽

- **使用者**：`profiles.id`（uuid）是不會變的使用者 ID；`profiles.username` 是使用者自己取的 `@ID`。
- **驗證碼資料表**：驗證碼從 `profiles.totp`（jsonb）拆成 `totp_accounts` + `totp_secrets` 兩張表。
  個人與群組共用：個人的 `owner_id` 有值，群組的 `group_id` 有值，兩者剛好一個。
  金鑰獨立一張表，才能做到「看得到驗證碼、拿不到金鑰」。
- **全站身分組**（後台）：Discord 式 bitfield，多身分組權限 OR，有 `@everyone`、有階層。
- **群組**：等於 Discord 的伺服器。有擁有者、群組自己的身分組（含 `@everyone`）、成員、邀請；
  群組裡的每一筆驗證碼等於 Discord 的頻道，可以對身分組 / 成員設定允許 / 拒絕覆寫。
- **所有資料表都開 RLS 且不開任何 policy**（`profiles` 除外，沿用原本的 policy）：
  讀寫一律走 `security definer` 的 RPC，權限在函式裡檢查。這樣規則集中、PGlite 測得到。
- 錯誤一律 `raise exception '<繁中訊息>'`（errcode 預設 P0001），前端直接把 `error.message` 顯示在錯誤對話框。
- bitfield 在資料庫是 `bigint`，前端是 `number`（目前只用到 bit 0～9，遠小於 2^31，可直接用位元運算）。

## 1. 權限位元

### 1.1 全站權限（site）

| 名稱 | 值 | 說明 |
|---|---|---|
| `ADMINISTRATOR` | 1 | 管理員：擁有所有全站權限，且不受階層限制 |
| `VIEW_ADMIN` | 2 | 進入後台 |
| `VIEW_USERS` | 4 | 查看使用者列表與基本資料 |
| `MANAGE_USERS` | 8 | 修改使用者資料（名稱、@ID）、刪除使用者 |
| `VIEW_USER_TOTP` | 16 | 查看使用者的 2FA（金鑰與驗證碼；已啟用個人加密的看不到） |
| `MANAGE_USER_TOTP` | 32 | 修改、刪除使用者的 2FA |
| `MANAGE_ROLES` | 64 | 建立 / 編輯 / 刪除身分組、指派身分組 |
| `VIEW_AUDIT_LOG` | 128 | 查看全站操作紀錄 |
| `CREATE_GROUPS` | 256 | 建立群組（`@everyone` 預設有） |
| `MANAGE_GROUPS` | 512 | 查看與管理所有群組（在任何群組都視同擁有全部群組權限，但不能做「擁有者限定」的動作） |

`SITE_ALL = 1023`。

### 1.2 群組權限（group）

| 名稱 | 值 | 可覆寫 | 說明 |
|---|---|---|---|
| `ADMINISTRATOR` | 1 | | 群組管理員：擁有所有群組權限，覆寫對他無效 |
| `VIEW_CODES` | 2 | ✓ | 看得到這筆驗證碼與目前的動態碼（不含金鑰） |
| `VIEW_SECRETS` | 4 | ✓ | 查看、匯出金鑰（沒有 `VIEW_CODES` 時無效） |
| `MANAGE_CODES` | 8 | ✓ | 新增、編輯、刪除、排序驗證碼 |
| `CREATE_INVITE` | 16 | | 建立邀請連結、用 Email / @ID 邀請 |
| `KICK_MEMBERS` | 32 | | 移除成員 |
| `MANAGE_ROLES` | 64 | | 管理身分組、指派身分組、設定驗證碼覆寫 |
| `MANAGE_GROUP` | 128 | | 修改群組名稱與說明、撤銷別人的邀請 |
| `VIEW_AUDIT_LOG` | 256 | | 查看群組操作紀錄 |

`GROUP_ALL = 511`，可覆寫的位元 `GROUP_OVERWRITABLE = 14`（VIEW_CODES | VIEW_SECRETS | MANAGE_CODES）。
新群組的 `@everyone` 預設 `VIEW_CODES`（2）。

### 1.3 權限計算

**全站** `site_permissions(uid)`：
1. `@everyone` 的 permissions OR 該使用者所有身分組的 permissions。
2. 含 `ADMINISTRATOR` → 回傳 `SITE_ALL`。

**群組基礎權限** `group_permissions(gid, uid)`：
1. 群組擁有者 → `GROUP_ALL`。
2. 全站權限有 `ADMINISTRATOR` 或 `MANAGE_GROUPS` → `GROUP_ALL`。
3. 不是成員 → 0。
4. 群組 `@everyone` OR 成員所有群組身分組；含 `ADMINISTRATOR` → `GROUP_ALL`。

**單筆驗證碼權限** `account_permissions(account_id, uid)`（照 Discord 頻道的算法）：
1. `base = group_permissions(...)`；base 含 ADMINISTRATOR（也就是 = GROUP_ALL 且來自上面 1、2 或身分組 ADMINISTRATOR）→ 回傳 `GROUP_ALL`。
2. 套用 `@everyone` 的覆寫：`base = (base & ~deny) | allow`。
3. 該成員所有身分組的覆寫：allow 全部 OR、deny 全部 OR，`base = (base & ~deny) | allow`。
4. 該成員本人的覆寫：`base = (base & ~deny) | allow`。
5. 沒有 `VIEW_CODES` → 回傳 0（看不到的驗證碼什麼都不能做）。

覆寫只影響 `GROUP_OVERWRITABLE` 的位元，寫入時其他位元一律清掉。

### 1.4 階層

- 每個身分組有 `position`（整數，越大越高）；`@everyone` 永遠是 0，不能移動、不能刪除、不能被指派（每個人本來就有）。
- 使用者的「最高位置」= 他擁有的身分組中最大的 position（沒有就 0）。
- **群組**：擁有者不受限制。其他人要有對應權限，而且：
  - 只能編輯 / 刪除 / 指派 / 移除 **position 比自己最高位置低** 的身分組。
  - 只能踢掉、改身分組給 **最高位置比自己低** 的成員；任何人都不能踢擁有者。
  - 編輯身分組權限時，只能開啟自己有的位元（群組 ADMINISTRATOR 例外）。
  - 設定覆寫時，對身分組的覆寫要該身分組比自己低；對成員的覆寫要該成員比自己低；`@everyone` 都可以。
  - 全站 `ADMINISTRATOR` / `MANAGE_GROUPS` 在群組裡視同擁有者（但不能轉移擁有權、不能刪除群組以外……見各函式）。
- **全站**：沒有擁有者。只有「最高位身分組的持有者」不受階層限制（0010 起；一般的 `ADMINISTRATOR` 也要遵守）；其他人照上面的規則。
  另外保護：不能讓全站「最後一位」擁有 ADMINISTRATOR 的使用者失去它（刪身分組、改權限、移除指派、刪除使用者都要擋）。

## 2. 資料表

### 2.1 0008_accounts.sql（使用者 @ID + 驗證碼資料表）

```sql
-- profiles 加 @ID
alter table profiles add column username text;            -- 存小寫
create unique index profiles_username_key on profiles (username);
alter table profiles add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9_.]{3,32}$');

create table totp_accounts (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid references profiles(id) on delete cascade,
  group_id   uuid,                                      -- 0009 再加 FK 到 groups
  name       text not null default '',
  category   text not null default '',
  digits     int  not null default 6  check (digits in (6, 8)),
  period     int  not null default 30 check (period in (30, 60)),
  algorithm  text not null default 'SHA-1' check (algorithm in ('SHA-1','SHA-256','SHA-512')),
  pinned     boolean not null default false,
  position   int  not null default 0,                   -- 小的排前面
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((owner_id is null) <> (group_id is null))
);
create index on totp_accounts (owner_id, position);
create index on totp_accounts (group_id, position);

create table totp_secrets (
  account_id uuid primary key references totp_accounts(id) on delete cascade,
  secret     text not null                              -- Base32，或個人加密後的 enc:v1:...
);
```

- 兩張表 `enable row level security`，不建 policy，`revoke all ... from anon, authenticated`。
- **搬資料**：把每個 profile 的 `totp` jsonb 依陣列順序搬進來（`position` = 陣列索引），
  `id` 是合法 uuid 就沿用，否則重新產生；`pinned`、`digits`、`period`、`algorithm` 沒有就用預設值。
  搬完後把 `profiles.totp` 設成 `'[]'`（欄位保留，不刪）。
- **之後寫進 `profiles.totp` 的資料自動轉存**：`profiles` 加 AFTER INSERT OR UPDATE OF totp 的 trigger，
  `jsonb_array_length(new.totp) > 0` 時把內容轉存成 totp_accounts（接在最後面）再把 totp 清成 `'[]'`。
  這樣 `ensure_profile` / `handle_new_user` 接回 Firestore 舊資料的流程不用改，也擋住舊版前端寫入。

**個人驗證碼 RPC**（名稱沿用 0006 / 0007，前端 `crud.ts` 幾乎不用改；全部 `security definer`、只動 `auth.uid()` 自己的資料、回傳整個清單）：

回傳格式 `TotpItem[]`（jsonb 陣列，依 `position` 排序）：
`{ id, name, secret, category, digits, period, algorithm, pinned }`

| 函式 | 說明 |
|---|---|
| `totp_list()` | 讀取自己的全部驗證碼 |
| `totp_add(items jsonb)` | 新增（陣列；每筆可帶 id，沒帶就產生），接在最後 |
| `totp_update(item_id text, patch jsonb)` | 只改 patch 裡有的欄位（name/category/secret/digits/period/algorithm/pinned）；找不到回傳 null |
| `totp_delete(item_id text)` | 刪除 |
| `totp_clear()` | 全部刪除 |
| `totp_reorder(ids text[])` | 依 ids 重排，不在 ids 裡的照原順序接在後面 |
| `totp_set_vault(new_vault jsonb, secrets jsonb)` | 更新 `profiles.vault` 並一次換掉多筆金鑰（`{ id: secret }`），回傳清單 |

未登入（`auth.uid()` 為 null）一律回傳 null。

**@ID RPC**：

| 函式 | 說明 |
|---|---|
| `set_username(new_username text) returns text` | 轉小寫、trim、去掉開頭的 `@`；格式不符、保留字、已被使用都 raise；傳 null 或空字串代表清除；回傳存進去的值 |
| `username_available(name text) returns boolean` | 給表單即時檢查用 |

保留字：`admin`、`administrator`、`root`、`system`、`securibit`、`everyone`、`here`、`support`、`help`、`null`、`undefined`。

### 2.2 0009_groups_permissions.sql

```sql
-- 全站身分組
create table site_roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  color       text not null default '',               -- '#rrggbb' 或空字串（無顏色）
  position    int  not null default 0,
  permissions bigint not null default 0,
  is_default  boolean not null default false,          -- @everyone，只有一個
  created_at  timestamptz not null default now()
);
create table site_user_roles (
  user_id uuid references profiles(id) on delete cascade,
  role_id uuid references site_roles(id) on delete cascade,
  primary key (user_id, role_id)
);
-- 還沒註冊的人先記著，第一次登入（ensure_profile）時套上
create table site_pending_roles (
  email   text not null,                               -- 小寫
  role_id uuid references site_roles(id) on delete cascade,
  primary key (email, role_id)
);

-- 群組
create table groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 50),
  description text not null default '' check (char_length(description) <= 300),
  owner_id    uuid not null references profiles(id),
  created_at  timestamptz not null default now()
);
create table group_roles (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references groups(id) on delete cascade,
  name        text not null,
  color       text not null default '',
  position    int  not null default 0,
  permissions bigint not null default 0,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);
create table group_members (
  group_id  uuid references groups(id) on delete cascade,
  user_id   uuid references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create table group_member_roles (
  group_id uuid,
  user_id  uuid,
  role_id  uuid references group_roles(id) on delete cascade,
  primary key (group_id, user_id, role_id),
  foreign key (group_id, user_id) references group_members(group_id, user_id) on delete cascade
);
-- 邀請連結
create table group_invites (
  code       text primary key,                         -- 10 碼英數
  group_id   uuid not null references groups(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,                              -- null = 不過期
  max_uses   int,                                      -- null = 不限
  uses       int not null default 0,
  revoked_at timestamptz
);
-- Email / @ID 邀請（對方接受或拒絕後刪除）
create table group_email_invites (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups(id) on delete cascade,
  email      text not null,                            -- 小寫
  invited_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (group_id, email)
);
-- 單筆驗證碼覆寫
create table group_account_overwrites (
  account_id  uuid references totp_accounts(id) on delete cascade,
  target_type text check (target_type in ('role', 'member')),
  target_id   uuid,                                    -- group_roles.id 或 profiles.id
  allow       bigint not null default 0,
  deny        bigint not null default 0,
  primary key (account_id, target_type, target_id)
);
-- 操作紀錄
create table audit_logs (
  id          bigint generated always as identity primary key,
  group_id    uuid references groups(id) on delete cascade, -- null = 全站
  actor_id    uuid references profiles(id) on delete set null,
  action      text not null,                           -- 例如 'group.role.update'
  target_type text,
  target_id   text,
  detail      jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

alter table totp_accounts add foreign key (group_id) references groups(id) on delete cascade;
```

全部 `enable row level security`、不建 policy、`revoke all from anon, authenticated`。

**種子資料**：
- `site_roles`：`@everyone`（position 0、is_default、permissions = 256 CREATE_GROUPS）、
  `管理員`（position 100、color `#e11d48`、permissions = 1 ADMINISTRATOR）。
- `marryhan25648@gmail.com`：已有 profile 就直接指派「管理員」；同時寫進 `site_pending_roles`。
- 重新定義 `ensure_profile()`：原本的邏輯不變，**最後**（profile 已存在也要執行）把 `site_pending_roles` 中 email 符合的指派掉並刪除。
  `handle_new_user` 觸發器也一樣補上。

**操作紀錄的 target_type**：`role`、`user`、`member`、`account`、`invite`、`group`；detail 盡量帶 `name`（畫面會顯示）。

**操作紀錄要記的動作**（action 名稱）：
- 全站：`site.role.create/update/delete/reorder`、`site.user.roles`、`site.user.update`、`site.user.delete`、
  `site.user.totp.view`、`site.user.totp.update`、`site.user.totp.delete`
- 群組：`group.create`、`group.update`、`group.transfer`、`group.role.create/update/delete/reorder`、
  `group.member.roles`、`group.member.kick`、`group.member.join`、`group.member.leave`、
  `group.invite.create/revoke`、`group.invite.email`、`group.account.create/update/delete`、
  `group.account.overwrite`、`group.account.secret.view`（取得金鑰時）

## 3. RPC（0009）

全部 `security definer`、`set search_path = public`、`revoke execute from public, anon`、`grant execute to authenticated`。
權限不足時的訊息格式：`權限不足：需要「<權限中文名>」`；階層不足：`只能管理比你目前最高身分組還低的身分組 / 成員`。
所有 JSON 欄位名稱用 snake_case。

### 3.1 自己的權限

`me_permissions() returns jsonb`
```json
{ "permissions": 1023, "top_position": 100,
  "roles": [{ "id": "...", "name": "管理員", "color": "#e11d48", "position": 100 }] }
```
`permissions` 已展開（有 ADMINISTRATOR 時是 SITE_ALL）。`roles` 不含 @everyone，依 position 由高到低。

### 3.2 群組

`SiteUserBrief` / 成員資料共用格式：`{ id, name, username, photo_url, email }`（email 只在呼叫者有全站 VIEW_USERS 或是群組成員時回傳；群組內一律回傳）。

| 函式 | 權限 | 回傳 |
|---|---|---|
| `group_create(name text, description text)` | 全站 CREATE_GROUPS | 新群組 id（uuid）。同時建立 `@everyone`（position 0、permissions 2）並把自己加成成員 |
| `my_groups()` | 登入 | `[{ id, name, description, owner_id, is_owner, member_count, account_count, permissions }]`，`permissions` = 我在該群組的基礎權限；account_count = 我看得到的數量 |
| `group_detail(gid uuid)` | 成員（或全站 MANAGE_GROUPS） | 見下方 |
| `group_update(gid, name text, description text)` | MANAGE_GROUP | void |
| `group_delete(gid)` | 擁有者、全站 ADMINISTRATOR | void |
| `group_transfer(gid, new_owner uuid)` | 擁有者 | void；新擁有者必須是成員 |
| `group_leave(gid)` | 成員 | void；擁有者不能離開（要先轉移或刪除） |
| `group_kick(gid, user_id)` | KICK_MEMBERS + 階層 | void |
| `group_set_member_roles(gid, user_id, role_ids uuid[])` | MANAGE_ROLES + 階層 | void；只改「呼叫者管得到」的那些身分組，管不到的維持原樣；有加入管不到的就 raise |
| `group_role_create(gid, name, color, permissions bigint)` | MANAGE_ROLES | 新身分組 id；position = 1，其他 position ≥ 1 的身分組全部 +1（同 Discord：新身分組在 @everyone 正上方） |
| `group_role_update(role_id, name, color, permissions bigint)` | MANAGE_ROLES + 階層 + 只能開自己有的位元 | void；@everyone 只能改 permissions |
| `group_role_delete(role_id)` | MANAGE_ROLES + 階層 | void；@everyone 不能刪 |
| `group_roles_reorder(gid, role_ids uuid[])` | MANAGE_ROLES | void；role_ids = 由高到低的完整順序（不含 @everyone）。只允許變動比自己低的身分組：自己管不到的身分組 position 不能變、相對順序也不能變，否則 raise。實作：依新順序重新編號為 n..1 |
| `group_accounts(gid)` | 成員 | 見下方 |
| `group_account_add(gid, items jsonb)` | MANAGE_CODES（群組層級） | 新增的 id 陣列 `uuid[]`；items 同個人 `TotpInput` |
| `group_account_update(account_id, patch jsonb)` | 該筆的 MANAGE_CODES | void；改 secret 不需要 VIEW_SECRETS |
| `group_account_delete(account_id)` | 該筆的 MANAGE_CODES | void |
| `group_accounts_reorder(gid, ids uuid[])` | MANAGE_CODES（群組層級） | void |
| `group_account_secret(account_id)` | 該筆的 VIEW_SECRETS | 金鑰字串；記錄 `group.account.secret.view` |
| `group_account_secrets(gid)` | — | `{ "<account_id>": "<secret>" }`，只含呼叫者有 VIEW_SECRETS 的；用來匯出 / 前端自己產碼；記錄一筆 secret.view（detail 帶數量） |
| `group_account_overwrites(account_id)` | MANAGE_ROLES | `[{ target_type, target_id, allow, deny }]` |
| `group_set_overwrite(account_id, target_type, target_id, allow bigint, deny bigint)` | MANAGE_ROLES + 階層 | void；allow、deny 都是 0 就刪除那筆覆寫；`allow & deny` 不可重疊 |
| `group_codes_permitted(gid)` | 成員 | `uuid[]`：呼叫者有 VIEW_CODES 的驗證碼 id（給 `/api/groups/codes` 用） |
| `group_audit_log(gid, before_id bigint, page_size int)` | VIEW_AUDIT_LOG | `[{ id, actor: SiteUserBrief, action, target_type, target_id, detail, created_at }]`，id 由大到小，before_id null 從最新開始 |

`group_detail(gid)`：
```json
{
  "group": { "id": "...", "name": "...", "description": "...", "owner_id": "...", "created_at": "..." },
  "is_owner": false,
  "permissions": 2,
  "top_position": 0,
  "roles": [{ "id": "...", "name": "@everyone", "color": "", "position": 0, "permissions": 2, "is_default": true, "member_count": 3 }],
  "members": [{ "id": "...", "name": "...", "username": "...", "photo_url": "...", "email": "...",
                "role_ids": ["..."], "joined_at": "...", "is_owner": true, "top_position": 0 }],
  "invites": [{ "code": "...", "created_by": { SiteUserBrief }, "created_at": "...", "expires_at": null,
                "max_uses": null, "uses": 0 }],
  "email_invites": [{ "id": "...", "email": "...", "invited_by": { SiteUserBrief }, "created_at": "..." }]
}
```
`roles` 由高到低（@everyone 最後）。`invites` / `email_invites` 只在有 CREATE_INVITE 或 MANAGE_GROUP 時有內容，否則是空陣列；
只回傳未撤銷、未過期、未用完的連結。

`group_accounts(gid)`：只回傳呼叫者有 VIEW_CODES 的，依 position 排序。
```json
[{ "id": "...", "name": "...", "category": "...", "digits": 6, "period": 30, "algorithm": "SHA-1",
   "pinned": false, "permissions": 14, "has_overwrites": false }]
```
**不含金鑰**。`permissions` = 該筆的有效權限（account_permissions）。

### 3.3 邀請

| 函式 | 權限 | 回傳 |
|---|---|---|
| `group_invite_create(gid, expires_in_hours int, max_uses int)` | CREATE_INVITE | 邀請碼 text。null = 不過期 / 不限次數 |
| `group_invite_revoke(code text)` | 建立者，或 MANAGE_GROUP | void |
| `group_invite_info(code text)` | 登入 | `{ valid, reason, group: { id, name, description, member_count }, inviter: SiteUserBrief, already_member }`。reason：`not_found` / `revoked` / `expired` / `used_up`，有效時為 null |
| `group_join(code text)` | 登入 | 群組 id；已是成員直接回傳 id 不扣次數；成功時 uses + 1 |
| `group_invite_user(gid, target text)` | CREATE_INVITE | void。target 是 email 或 `@ID`（開頭 @，或不含 @ 的字串都當 @ID）。@ID 找不到使用者 → raise「找不到這個 @ID」；email 可以是還沒註冊的人。已是成員 → raise；已邀請過 → 不重複新增 |
| `group_email_invite_cancel(invite_id uuid)` | 邀請者，或 CREATE_INVITE | void |
| `my_invitations()` | 登入 | `[{ id, group: { id, name, description, member_count }, invited_by: SiteUserBrief, created_at }]`，比對 `auth.users.email`（小寫） |
| `respond_invitation(invite_id uuid, accept boolean)` | 被邀請者本人 | 接受時回傳群組 id，拒絕回傳 null；兩者都刪除邀請 |

### 3.4 後台

| 函式 | 權限 | 回傳 |
|---|---|---|
| `admin_users(search text, page_offset int, page_size int)` | VIEW_USERS | `{ total, users: [AdminUser] }`。search 比對 email / name / username（ilike），null 列全部；依 created 新到舊 |
| `admin_user(user_id)` | VIEW_USERS | `AdminUser` 加 `groups: [{ id, name, is_owner }]` |
| `admin_update_user(user_id, name text, username text)` | MANAGE_USERS + 階層 | void；username 規則同 set_username；null 代表不改，空字串代表清除 |
| `admin_user_totp(user_id)` | VIEW_USER_TOTP | `[{ id, name, category, digits, period, algorithm, pinned, secret, encrypted }]`；已加密的 `secret` 是 null、`encrypted` true；記錄 `site.user.totp.view` |
| `admin_update_user_totp(user_id, item_id, patch jsonb)` | MANAGE_USER_TOTP | void；patch 欄位同 totp_update；該使用者啟用加密時不能改 secret（raise） |
| `admin_delete_user_totp(user_id, item_id)` | MANAGE_USER_TOTP | void |
| `admin_can_delete_user(user_id) returns boolean` | — | MANAGE_USERS + 階層 + 不是自己 + 不是最後一位管理員 + 沒有擁有任何群組；給 `/api/admin/delete-user` 用（不通過時 raise 說明原因） |
| `can_delete_self()` | 登入 | 自己刪除帳戶前檢查：還擁有群組、或是最後一位管理員時 raise；否則 true（`/api/delete-account` 用） |
| `site_roles_list()` | VIEW_ADMIN | `[{ id, name, color, position, permissions, is_default, member_count }]` 由高到低 |
| `site_role_create(name, color, permissions)` | MANAGE_ROLES | id；position 規則同群組 |
| `site_role_update(role_id, name, color, permissions)` | MANAGE_ROLES + 階層 + 只能開自己有的位元 | void |
| `site_role_delete(role_id)` | MANAGE_ROLES + 階層 | void |
| `site_roles_reorder(role_ids uuid[])` | MANAGE_ROLES | void（規則同群組） |
| `site_set_user_roles(user_id, role_ids uuid[])` | MANAGE_ROLES + 階層 | void（規則同 group_set_member_roles） |
| `admin_groups(search text)` | MANAGE_GROUPS | `[{ id, name, description, owner: SiteUserBrief, member_count, account_count, created_at }]` |
| `admin_audit_log(before_id bigint, page_size int)` | VIEW_AUDIT_LOG | 同 group_audit_log，但只列全站紀錄（group_id null） |

`AdminUser`：
```json
{ "id": "...", "email": "...", "name": "...", "username": "...", "photo_url": "...",
  "creation_time": "...", "last_login_at": "...", "last_login_ip": "...", "last_login_device": "...",
  "role_ids": ["..."], "top_position": 0, "totp_count": 3, "vault_enabled": false }
```

## 4. Next.js API route

- `POST /api/groups/codes`，body `{ groupId }`，header `Authorization: Bearer <access_token>`。
  1. 用使用者的 token 建 client（`global.headers.Authorization`）呼叫 `group_codes_permitted(gid)`。
  2. 用 service role 讀這些 id 的 `totp_secrets`，在伺服器端產生目前與下一組驗證碼（沿用 `src/lib/totp/otp.ts` 的 `generateOtp`）。
  3. 回傳 `{ now: <ms>, codes: { "<id>": { code, next } } }`（金鑰不會離開伺服器）。
- `POST /api/admin/delete-user`，body `{ userId }`：用使用者 token 呼叫 `admin_can_delete_user`，通過才用 service role
  刪 profile、`auth.admin.deleteUser`，並寫 `audit_logs`（`site.user.delete`）。
- 兩支都沿用 `src/app/api/delete-account/route.ts` 的寫法（Bearer token、service role client），
  共用部分抽到 `src/lib/server/supabaseAdmin.ts`。

## 5. 前端

### 5.1 檔案配置

```
src/lib/permissions/bits.ts        權限位元定義（含中文名稱、說明）、has()、hasAny()、toggle()
src/lib/permissions/hierarchy.ts   前端判斷「能不能管理這個身分組 / 成員」（只決定按鈕顯示，真正的檢查在資料庫）
src/lib/rpc.ts                     共用的 rpc 包裝：{ success: true, data } | { success: false, message }
src/lib/groups/*.ts                群組相關 RPC 包裝
src/lib/admin/*.ts                 後台相關 RPC 包裝
src/types/Group/*.ts               群組型別
src/types/Admin/*.ts               後台型別
src/types/Permission/*.ts          身分組、覆寫等共用型別
src/components/permissions/        共用的身分組編輯器（全站與群組共用）、覆寫編輯器
src/app/groups/                    群組列表、建立、收到的邀請
src/app/groups/[id]/               群組內頁（驗證碼 / 成員 / 身分組 / 邀請 / 設定 / 紀錄）
src/app/invite/[code]/             邀請連結加入頁
src/app/admin/                     後台（總覽、使用者、使用者詳情、身分組、群組、紀錄）
```

### 5.2 登入狀態

- `AuthContextValue` 增加 `permissions: number`（全站，已展開）、`topPosition: number`、
  `siteRoles: SiteRoleBrief[]`、`can(bit: number) => boolean`。登入後跟 profile 一起載入 `me_permissions()`。
- `Profile` 增加 `username: string`（沒有時為空字串）。
- `AuthGate` 的保護路徑加上 `/groups`、`/invite`、`/admin`；`/admin` 開頭還要 `VIEW_ADMIN`，
  沒有時跳錯誤對話框「沒有權限進入後台」並導回首頁。

### 5.3 畫面

- **Navbar / Sidebar**：登入後多「群組」；有 VIEW_ADMIN 多「後台」。
- **個人頁 / 管理帳戶**：顯示使用者 ID（uuid，可複製）與 @ID；管理帳戶可以設定 @ID（即時檢查可不可用）。
- **我的驗證碼**：每張卡片的 ⋯ 選單多「分享到群組」（複製一份到自己有 MANAGE_CODES 的群組；有加密時先用目前的 key 解開）。
- **群組列表 `/groups`**：我的群組卡片、建立群組（有 CREATE_GROUPS 才顯示）、收到的邀請（接受 / 拒絕）。
- **群組內頁 `/groups/[id]`**（Tabs，看不到的分頁不顯示）：
  - 驗證碼：沿用 CodeCard 的外觀。動態碼來源：該筆有 VIEW_SECRETS 就前端自己產碼（`group_account_secrets`）；
    只有 VIEW_CODES 就每個週期打 `/api/groups/codes`。MANAGE_CODES 才有新增 / 編輯 / 刪除 / 排序；
    MANAGE_ROLES 才有「權限」（覆寫編輯器）。
  - 成員：列表（大頭照、名稱、@ID、身分組 chip 用身分組顏色）、指派身分組、踢出、轉移擁有權。
  - 身分組：Discord 式左右兩欄（左：清單、上下移動；右：名稱、顏色、權限開關）。
  - 邀請：建立連結（有效時間：1 小時 / 1 天 / 7 天 / 永不；次數：1 / 5 / 10 / 25 / 不限）、複製連結、撤銷；
    Email / @ID 邀請與待回覆清單。
  - 設定：名稱、說明；離開群組；擁有者：轉移、刪除群組。
  - 紀錄：操作紀錄列表（往下載入更多）。
- **邀請頁 `/invite/[code]`**：顯示群組資訊與邀請人，按「加入群組」。未登入時先跳登入。
- **後台 `/admin`**：
  - 使用者：搜尋、分頁表格（大頭照、名稱、@ID、Email、身分組、驗證碼數、最後登入）。
  - 使用者詳情：基本資料（可改名稱、@ID）、身分組指派、2FA 清單（可顯示動態碼 / 金鑰、編輯、刪除；已加密顯示「已加密」）、
    所在群組、刪除使用者。
  - 身分組：同群組的身分組編輯器，權限清單換成全站權限。
  - 群組：所有群組列表，點進去用 `/groups/[id]`（全站 MANAGE_GROUPS 在群組內有全部權限）。
  - 紀錄：全站操作紀錄。

### 5.4 覆寫編輯器（Discord 頻道權限）

對單一驗證碼：左邊是已設定覆寫的對象（@everyone 永遠在、可新增身分組或成員），右邊每個可覆寫的權限一列三個按鈕：
「✕ 拒絕」（紅）/「／ 繼承」（灰）/「✓ 允許」（綠）。

## 6. 實作備註（與上面規格的補充 / 差異）

- **權限中文名稱**以 `src/lib/permissions/bits.ts` 為準，SQL 的 `site_perm_name` / `group_perm_name`（錯誤訊息用）與它一致。
- **position 只代表順序**：reorder、刪除身分組後會重新編號為 n..1，管理員的 position 不會一直是 100，不要寫死。
  reorder 的「管不到的不能動」比較的是排名，不是 position 數字。
- 有 MANAGE_ROLES 的人都能編輯 `@everyone`（同 Discord），但一樣只能開自己有的位元。
- `group_set_overwrite`：新開的「允許」只能是呼叫者在這筆驗證碼本身就有的權限，避免沒有 VIEW_SECRETS 的人對 @everyone 開允許來拿金鑰。
- 未登入時：totp_* 回傳 null、`me_permissions` 回傳 null，其他 RPC raise「請先登入」。
- 非成員呼叫 `group_codes_permitted`、`group_account_secrets` 會 raise「你不是這個群組的成員」；
  `group_account_secrets` 沒有可看的金鑰時回 `{}` 且不寫紀錄。
- `digits`、`period`、`algorithm`、`pinned` 不合法時不 raise：新增用預設值、修改保留原值。
  `group_update`、`group_role_update`、`site_role_update` 傳 null 的參數代表不改。身分組名稱 1～50 字，顏色只接受 `''` 或 `#rrggbb`。
- `admin_update_user` 改自己不受階層限制。
- 刪除群組記在全站紀錄（`group.delete`），因為群組紀錄會跟著群組刪掉。
- 踢人、離開時會一併刪除該成員在群組驗證碼上的成員覆寫；`group_join` 成功會刪掉同一人在該群組的 Email 邀請。
- `marryhan25648@gmail.com`：已有 profile 就直接指派「管理員」，還沒有才寫進 `site_pending_roles`（避免之後被移除管理員後，下次登入又被加回去）。
- `@everyone` 的 id 固定 `00000000-0000-0000-0000-000000000000`，「管理員」固定 `00000000-0000-0000-0000-000000000001`。
- `/api/delete-account` 刪除前呼叫 `can_delete_self()`。
- **0010 安全性修正（`0010_security_fixes.sql`）**：
  - **全站階層**：只有「最高位身分組的持有者」（`site_is_root`：自己有身分組，而且沒有任何人的最高身分組比自己高；
    只看有人持有的身分組，最上面的身分組沒人時由下一個有人持有的身分組接手）不受階層限制。
    一般 `ADMINISTRATOR` 仍有全部權限位元，但不能動比自己高或同位的身分組與使用者。前端 `isSiteRoot()` 同規則。
  - **後台 2FA**：`admin_user_totp`、`admin_update_user_totp`、`admin_delete_user_totp` 目標是自己，或 `site_can_manage_user` 管得到對方才行。
  - **指派身分組**：`group_set_member_roles`、`site_set_user_roles` 新加入的身分組，權限必須是呼叫者（已展開）權限的子集，
    超過時 raise「只能指派權限不超過你自己的身分組」。群組擁有者 / 全站管理例外；全站沒有例外（管理員本來就是全有），
    避免最高位但沒有 ADMINISTRATOR 的人替自己升權。移除既有身分組不受這條限制。
  - **驗證碼覆寫**：取代上面「新開的允許」規則——允許與拒絕中**有變動的位元**（新舊 XOR）都必須是呼叫者在這筆驗證碼本身就有的權限，
    否則 raise「只能變更你自己在這筆驗證碼擁有的權限」（例如沒有 VIEW_SECRETS 的人不能拿掉 @everyone 對 VIEW_SECRETS 的拒絕）。擁有者 / 全站管理例外。
  - **最後一位管理員**：`site_assert_admin_left` 先 `pg_advisory_xact_lock(hashtext('site_admins'))` 再數（改成 volatile），
    兩個交易同時拿掉不同管理員時後到的會被擋。群組沒有「最後一位管理員」檢查（永遠有擁有者），不需要對應處理。
    `/api/delete-account`、`/api/admin/delete-user` 的「檢查 → 刪除」橫跨兩次請求，仍無法完全避免同時刪除兩位管理員的極端情況。
  - **email 驗證**：`handle_new_user` / `ensure_profile` 只有在 `auth.users.email_confirmed_at` 有值時才接回 `legacy_import`、套用 `site_pending_roles`
    （`claim_verified_email`）；未驗證時保留在暫存表，之後登入發現已驗證再套（舊資料搬進已存在的 profile，`migrated = true`）。
    `user_email()` 只回傳已驗證的 email，所以未驗證的人看不到、也不能接受 Email 邀請。`ensure_profile` 每次會把 `profiles.email` / `email_verified` 同步成 auth.users。
  - **profiles 欄位權限**：`authenticated` 只有 select 與 `update (name, photo_url, bg_photo_url, phone_number, creation_time, last_sign_in_time, migration_notified, updated_at)`；
    不能 insert / delete，也不能直接改 email、email_verified、vault、username、last_login_*、migrated、totp。`user_brief`、`display_name` 的 email 改從 auth.users 取。
  - **加密設定**：`totp_set_vault(new_vault, secrets, expected_check default null)`：鎖住自己那列後比對目前 `vault.check` 與 `expected_check`
    （null 對 null 相同），不同就 raise「加密設定已在其他裝置變更，請重新整理」。加密設定有變時 secrets 必須涵蓋自己全部驗證碼；
    有加密時送來的金鑰都要是 `enc:v1:`，停用時都要是明文；new_vault 必須有字串 `check`。
    `totp_add` / `totp_update`：已啟用加密時金鑰不是 `enc:v1:` 開頭就 raise（擋明文；舊密碼的密文仍擋不到）。
  - **邀請**：邀請碼 = 12 bytes 安全亂數（`extensions.gen_random_bytes`，沒有 pgcrypto 時用兩個 `gen_random_uuid` 的亂數部分）轉 URL 安全 base64，16 碼；
    `group_invite_create` 有效時間 null 時預設 7 天、最長 720 小時（30 天），前端「永不過期」改成「30 天」。既有的永不過期連結在執行 0010 時改成 30 天後到期。
    成員離開或被踢時，撤銷他建立的邀請連結並刪除他送出的 Email / @ID 邀請。
  - **成員 email**：`group_detail` 的成員、邀請建立者、Email 邀請者，以及 `group_invite_info` 的邀請者，只有擁有者 / 全站管理、
    或有 KICK_MEMBERS / MANAGE_ROLES 的人拿得到 email（`group_sees_emails`），其他成員是 null。

## 7. 預設群組與加密群組（0011）

### 7.1 預設群組

- 「我的驗證碼」改成一個群組：每個使用者都有一個**預設群組**（`profiles.default_group_id`，只能指向**自己擁有**的群組，
  由觸發器 `profiles_default_group_guard` 擋下其他值；使用者不能直接改這個欄位）。
- 新使用者建立 profile 時（`handle_new_user` / `ensure_profile` 的 insert）由觸發器自動建立預設群組並設為預設；
  `ensure_profile` 每次登入也會確認預設群組還在（`ensure_default_group`），無效時補建。
- 預設群組的名稱（0015 起）：「<名稱>的群組」，名稱依序取 `profiles.name`（trim 後非空）→ @ID → email 的 @ 前段，
  都沒有用「我的群組」；超過 50 字只截名稱、保留「的群組」（`default_group_name(uid)`）。0011 建立、名稱仍是「我的」的預設群組由 0015 改名
  （群組紀錄記一筆操作者為系統的 `group.update`），使用者自己改過名的不動。
- 執行 0011 時：每個既有使用者建立「我的」，把個人驗證碼（`totp_accounts.owner_id` = 他）改成 `group_id` = 新群組、`owner_id` = null，
  金鑰（`totp_secrets`）、順序、釘選、類別不動。之後加上 check 約束 `totp_accounts_group_only (owner_id is null)`，個人路徑不能再寫入。
- 預設群組和一般群組一樣：可以邀請、設身分組、覆寫（加密時例外，見 7.2）。
- `group_set_default(gid)`：把自己擁有的群組設為預設，否則 raise「只能把自己擁有的群組設為預設」。
- `group_delete`：擁有者不能刪自己的預設群組（「這是你的預設群組，請先把其他群組設為預設再刪除」），
  也不能刪唯一擁有的群組（「你至少要擁有一個群組，不能刪除唯一的群組」）。全站 ADMINISTRATOR 可以刪別人的預設群組，
  刪除後擁有者的預設改到他擁有的另一個群組（最早建立的），沒有就建立新的預設群組。
- `group_transfer`：轉移自己的預設群組時，預設自動改到自己擁有的另一個群組（最早建立的），沒有就 raise
  「這是你唯一擁有的群組，請先建立另一個群組再轉移」；新擁有者的預設不受影響。觸發器 `groups_owner_guard` 也擋下直接改預設群組的擁有者。
- `my_groups()` 多了 `is_default`、`encrypted`，預設群組排第一；`group_detail()` 的 `group` 多了 `encrypted`，另外回傳
  `is_default`（是不是我的預設群組）與 `owned_count`（我擁有幾個群組）。
- 相容用的 `totp_list / totp_add / totp_update / totp_delete / totp_clear / totp_reorder`：名稱、參數、回傳格式不變，
  改成操作自己的預設群組（沒有就建立）。新版前端不再使用，一律走 `group_*` RPC。
- `group_accounts_clear(gid)`（群組層級 MANAGE_CODES）：刪除群組裡呼叫者在該筆有 MANAGE_CODES 的驗證碼，回傳筆數，記錄 `group.account.clear`。
- 後台的使用者 2FA（`admin_user_totp` / `admin_update_user_totp` / `admin_delete_user_totp`、`admin_user_json.totp_count`）改看使用者的預設群組。
- 接回 Firebase 舊資料（`legacy_import` → `profiles.totp` → 觸發器）直接放進預設群組；預設群組已加密時（舊資料是明文）另外建立一個沒加密的「舊版驗證碼」群組。
- 刪除帳號：`can_delete_self` / `admin_can_delete_user` 只擋「還擁有有其他成員的群組」。刪除 profile 前，
  觸發器 `profiles_delete_owned_groups` 先刪掉只有他一個成員的群組（含預設群組與裡面的驗證碼）；還有其他成員的群組由 `groups.owner_id` 的 FK 擋下整筆刪除。

### 7.2 加密群組

- 加密沿用每人一組的加密密碼（`profiles.vault`、`VaultProvider`），改成**套用在群組上**：`groups.encrypted = true` 的群組，
  金鑰是擁有者用自己的 vault 金鑰在瀏覽器加密的 `enc:v1:` 密文。只有擁有者能切換。
- 加密的群組只能有擁有者一個成員：`group_invite_create`、`group_invite_user`、`group_join`、`respond_invitation`（接受）
  一律 raise「加密的群組不能邀請其他人加入」；有其他成員時不能開啟加密（「群組還有其他成員，請先移除成員再開啟加密」）；
  開啟時撤銷所有邀請連結、刪除 Email / @ID 邀請。加密的群組不能轉移擁有權。
- 金鑰格式和加密狀態一致（`group_assert_secret_format`，`group_account_add` / `group_account_update` / `totp_add` / `totp_update` / `admin_update_user_totp`）：
  加密的群組只收 `enc:v1:`（「這個群組已加密，請重新整理並解鎖後再試」），沒加密的群組不收 `enc:v1:`。
  檢查時對群組列取共享鎖，和切換加密互斥。
- `group_set_encrypted(gid, encrypted, secrets, expected_check)`（只有擁有者，全站管理員也不行）：
  已設定加密密碼、`expected_check` 等於目前的 `vault.check`、secrets 涵蓋群組全部驗證碼，開啟時都是 `enc:v1:`、關閉時都是明文。
  鎖的順序：先 profile 再群組（和 `totp_set_vault` 相同，避免死結）。記錄 `group.encryption.enable` / `group.encryption.disable`。
- `totp_set_vault(new_vault, secrets, expected_check)`：作用範圍改成「自己擁有且 encrypted 的群組」，沿用 0010 的保護——
  比對 `expected_check`；加密設定有變（改密碼、停用）時 secrets 要涵蓋那些群組的全部驗證碼；有加密時都是 `enc:v1:`、停用時都是明文。
  停用時那些群組一起改成沒加密。第一次設定密碼時還沒有加密的群組，只存加密設定；前端接著在預設群組只有自己一個成員時呼叫 `group_set_encrypted` 加密它。
- `vault_reset()`（忘記密碼）：刪除自己擁有且已加密的群組裡的驗證碼，這些群組改成沒加密，`vault` 設為 null。沒加密的群組不受影響。
- `group_codes_permitted` 對加密群組回傳空陣列，`/api/groups/codes` 不產碼；擁有者用 `group_account_secrets` 拿到密文，解鎖後在瀏覽器解密再產碼。
  非擁有者（例如全站管理員）看得到清單但解不開，前端只顯示說明。
- 執行 0011 時，原本有 `vault` 的使用者，新建的預設群組直接標成 encrypted（金鑰本來就是密文）；重複執行不會把之後關掉的加密又打開。

### 7.3 前端

- 驗證碼頁（`CodeClient`）：沒有獨立的「我的」，切換列出所有群組（預設群組排第一、標示「預設」、加密的有鎖頭），
  選擇記在 `codeScope`（沒有記住或已不在時用預設群組），一律用 `GroupCodes` 顯示。`GroupCodes` 的「…」選單有隱藏、排序、匯出、清空（群組層級 MANAGE_CODES）；
  每筆的選單多了「複製到其他群組」。加密群組鎖定時在原地顯示解鎖表單（不再整頁 `VaultGate`）。
- 新增頁：「放到」預設選預設群組；加密的群組要先解鎖，送出前在瀏覽器加密。
- 群組設定：擁有者多一組「預設與加密」——「設為預設群組」與「加密」開關（沒設定密碼、有其他成員、鎖定中時說明原因）；
  預設群組 / 唯一擁有的群組的「刪除群組」停用並說明；加密的群組停用「轉移擁有權」。加密的群組不顯示「邀請」分頁。
- 帳戶設定的「金鑰加密」：說明加密套用在自己擁有、已開啟加密的群組，列出這些群組；設定密碼時順便加密預設群組（只有自己一個成員時）。
