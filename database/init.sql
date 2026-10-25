-- ============================================================
-- Securibit-Web：資料庫初始化腳本
--
-- 用途：在「全新、空白」的 Supabase 專案建立完整的 schema（資料表、函式、觸發器、
--       RLS policy、權限、Realtime publication 與內建種子資料）。
-- 用法：到 Supabase 後台 → SQL Editor，整份貼上執行一次即可（不要重複執行）。
-- 內容：等同於依序套用開發時的 0001 ～ 0025 migration 之後的最終狀態，
--       但只保留最終結果，不含搬移舊資料的步驟。
--       已經有資料的專案不要執行這份（資料表已存在會失敗）。
-- 依賴：Supabase 內建的 auth schema（auth.users、auth.sessions、auth.uid()、auth.jwt()）、
--       anon / authenticated / service_role 角色、extensions schema 與 supabase_realtime publication。
--       推播（選用）：pg_net、Supabase Vault（project_url、push_webhook_secret）、pg_cron（每分鐘補送），沒有就略過。
--
-- 權限模型（規格：docs/groups-and-permissions.md）
-- - 全站身分組：Discord 式 bitfield，多身分組權限 OR，有 @everyone、有階層
-- - 群組：等於 Discord 的伺服器；群組裡的每筆驗證碼等於頻道，可設定允許 / 拒絕覆寫
-- - 除了 profiles、sync_signals、session_devices 之外，資料表都開 RLS 且不建 policy，
--   讀寫一律走 security definer 的 RPC，權限在函式裡檢查。
-- - 全站擁有者（site_owner）是唯一不受全站階層限制的人；群組擁有者不受群組階層限制。
--
-- 全站權限：1 ADMINISTRATOR、2 VIEW_ADMIN、4 VIEW_USERS、8 MANAGE_USERS、16 VIEW_USER_TOTP、
--           32 MANAGE_USER_TOTP、64 MANAGE_ROLES、128 VIEW_AUDIT_LOG、256 CREATE_GROUPS、512 MANAGE_GROUPS、
--           1024 SEND_NOTIFICATIONS
--           SITE_ALL = 2047
-- 群組權限：1 ADMINISTRATOR、2 VIEW_CODES、4 VIEW_SECRETS、8 MANAGE_CODES、16 CREATE_INVITE、
--           32 KICK_MEMBERS、64 MANAGE_ROLES、128 MANAGE_GROUP、256 VIEW_AUDIT_LOG、512 BAN_MEMBERS
--           GROUP_ALL = 1023，可覆寫 GROUP_OVERWRITABLE = 14
--
-- 段落：
--   1. 擴充套件
--   2. 資料表（個人資料／全站身分組／群組／驗證碼／邀請／稽核紀錄／即時同步／登入裝置／通知）
--   3. 共用 helper
--   4. 全站身分組與權限
--   5. 個人資料與 @ID
--   6. 帳號建立與登入
--   7. 群組
--   8. 驗證碼
--   9. 金鑰加密
--  10. 邀請
--  11. 後台
--  12. 稽核紀錄與登入紀錄
--  13. 即時同步
--  14. 登入裝置
--  15. 通知、公告、最低版本
--  16. 權限設定（GRANT / REVOKE）
--  17. 種子資料（含 Storage bucket、推播用的 Vault secret 與排程）
--  18. （選用）指定第一位管理員與全站擁有者
-- ============================================================


-- ============================================================
-- 1. 擴充套件
-- ============================================================

-- pgcrypto：new_invite_code 用 extensions.gen_random_bytes 產生邀請碼（Supabase 預設已裝在 extensions schema）。
-- 沒有 pgcrypto 時 new_invite_code 會自動改用 gen_random_uuid。
create extension if not exists pgcrypto with schema extensions;

-- pg_net：通知有新的推播時，資料庫用它非同步呼叫 Edge Function push（見「15. 通知」）。
-- 沒有 pg_net 的環境（例如本機 PGlite 測試）略過，推播就只是留在 pending，其他功能照常
do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice '沒有 pg_net，略過推播呼叫：%', sqlerrm;
end;
$$;


-- ============================================================
-- 2. 資料表
-- ============================================================

-- ---------- 個人資料 ----------

-- 使用者個人資料表，主鍵對應 auth.users.id
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  email              text,                             -- 一律以 auth.users.email 為準（ensure_profile 同步）
  name               text,
  photo_url          text,
  bg_photo_url       text default '',                -- 空字串 = 前端用內建的漸層
  email_verified     boolean default false,
  phone_number       text default '',
  creation_time      text default '',
  last_sign_in_time  text default '',
  -- 舊版的驗證碼陣列；寫進來的資料會由 profiles_totp_to_accounts 觸發器轉存到群組後清空
  totp               jsonb not null default '[]'::jsonb,
  updated_at         timestamptz default now(),
  -- migrated：此帳號第一次登入時有接到 legacy_import 的舊資料
  -- migration_notified：是否已經提示過（避免重複跳）
  migrated           boolean not null default false,
  migration_notified boolean not null default false,
  -- 最後登入資訊：時間 / IP / 裝置
  last_login_at      timestamptz,
  last_login_ip      text,
  last_login_device  text,
  -- 金鑰加密設定 { v, salt, iterations, check }，null 代表未啟用。
  --   金鑰在瀏覽器裡用使用者的密碼加密後才存進 totp_secrets.secret（格式 enc:v1:<iv>:<密文>），
  --   資料庫只看得到密文；密碼本身不會送到伺服器。
  vault              jsonb,
  -- @ID（存小寫）
  username           text,
  -- 預設群組：不加 FK（群組刪除時由 RPC 處理預設；也避免刪帳號時 FK 動作改到正在刪除的 profile）。
  -- 只能指向自己擁有的群組（profiles_default_group_guard 觸發器）
  default_group_id   uuid,
  -- 自己上傳的大頭照（/api/profile/photo）：true 時舊版前端每次登入送來的 Google 大頭照不會蓋掉它
  photo_custom       boolean not null default false,
  constraint profiles_username_format check (username is null or username ~ '^[a-z0-9_.]{3,32}$')
);
create unique index profiles_username_key on public.profiles (username);

alter table public.profiles enable row level security;

-- 使用者只能讀、改自己那列（能改哪些欄位見「15. 權限設定」，改的值由 profiles_guard 觸發器把關）；
-- 新增 / 刪除 profile 只由觸發器、ensure_profile 與後端處理
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 從 Firestore 匯入的暫存資料，以 email 為對應鍵（Google uid 在 Supabase 會是全新 uuid）。
-- email 驗證過的使用者登入時由 claim_verified_email 接回並刪除。
-- 啟用 RLS 但不建任何 policy → 一般使用者讀不到任何資料，只有 service_role 與 security definer 函式能讀取。
create table public.legacy_import (
  email         text primary key,
  name          text,
  photo_url     text,
  bg_photo_url  text,
  phone_number  text,
  totp          jsonb not null default '[]'::jsonb
);

alter table public.legacy_import enable row level security;

-- ---------- 全站身分組 ----------

-- 全站身分組
create table public.site_roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  color       text not null default '',               -- '#rrggbb' 或空字串（無顏色）
  position    int  not null default 0,
  permissions bigint not null default 0,
  is_default  boolean not null default false,          -- @everyone，只有一個
  created_at  timestamptz not null default now()
);
create unique index site_roles_one_default on public.site_roles ((true)) where is_default;

create table public.site_user_roles (
  user_id uuid references public.profiles (id) on delete cascade,
  role_id uuid references public.site_roles (id) on delete cascade,
  primary key (user_id, role_id)
);
create index site_user_roles_role_idx on public.site_user_roles (role_id);

-- 還沒註冊的人先記著，第一次登入且 email 已驗證時（claim_verified_email → apply_pending_roles）套上
create table public.site_pending_roles (
  email   text not null,                               -- 小寫
  role_id uuid references public.site_roles (id) on delete cascade,
  primary key (email, role_id)
);

-- 全站擁有者（只有一列）：唯一不受全站階層限制的人；還沒有擁有者時由「最高位身分組的持有者」不受限。
-- pending_email：還沒註冊時先記 email（小寫），第一次登入且 email 已驗證時（apply_pending_roles）接上
create table public.site_owner (
  id            boolean primary key default true check (id),
  user_id       uuid references public.profiles (id) on delete set null,
  pending_email text
);

-- ---------- 群組 ----------

-- 群組。每個使用者都有一個預設群組（profiles.default_group_id，原本的「我的驗證碼」）。
-- encrypted：群組加密，只有擁有者能切換，用擁有者自己的 vault（profiles.vault）加解密；
--   加密的群組只能有擁有者一個成員（不能邀請、加入），伺服器也不替它產碼。
-- category_order：群組自訂的類別順序（所有成員共用，由前到後）；不在裡面的類別由前端照字母順序接在後面。
create table public.groups (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 50),
  description    text not null default '' check (char_length(description) <= 300),
  owner_id       uuid not null references public.profiles (id),
  created_at     timestamptz not null default now(),
  encrypted      boolean not null default false,
  category_order text[] not null default '{}'
);
create index groups_owner_idx on public.groups (owner_id);

create table public.group_roles (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  name        text not null,
  color       text not null default '',
  position    int  not null default 0,
  permissions bigint not null default 0,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index group_roles_group_idx on public.group_roles (group_id, position);
create unique index group_roles_one_default on public.group_roles (group_id) where is_default;

-- position：每位成員自己排的群組順序（同一個群組在每位成員的清單裡可以排在不同位置，只影響自己看到的順序）
create table public.group_members (
  group_id  uuid references public.groups (id) on delete cascade,
  user_id   uuid references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  position  int not null default 0,
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);
create index group_members_user_position_idx on public.group_members (user_id, position);

create table public.group_member_roles (
  group_id uuid,
  user_id  uuid,
  role_id  uuid references public.group_roles (id) on delete cascade,
  primary key (group_id, user_id, role_id),
  foreign key (group_id, user_id) references public.group_members (group_id, user_id) on delete cascade
);
create index group_member_roles_role_idx on public.group_member_roles (role_id);

-- 封鎖名單：被封鎖的人不能再透過邀請連結、Email / @ID 邀請加入，也不能被全站管理員直接加入
create table public.group_bans (
  group_id   uuid references public.groups (id) on delete cascade,
  user_id    uuid references public.profiles (id) on delete cascade,
  reason     text not null default '' check (char_length(reason) <= 200),
  banned_by  uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_bans_user_idx on public.group_bans (user_id);

-- ---------- 驗證碼 ----------

-- 驗證碼與金鑰分兩張表，才能做到「看得到驗證碼、拿不到金鑰」。
-- 驗證碼一律屬於群組（owner_id 只是舊版個人驗證碼留下的欄位，totp_accounts_group_only 約束它一律為 null）。
create table public.totp_accounts (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid references public.profiles (id) on delete cascade,
  group_id   uuid references public.groups (id) on delete cascade,
  name       text not null default '',
  category   text not null default '',
  digits     int  not null default 6  check (digits in (6, 8)),
  period     int  not null default 30 check (period in (30, 60)),
  algorithm  text not null default 'SHA-1' check (algorithm in ('SHA-1', 'SHA-256', 'SHA-512')),
  pinned     boolean not null default false,
  position   int  not null default 0,                   -- 小的排前面
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((owner_id is null) <> (group_id is null)),
  constraint totp_accounts_group_only check (owner_id is null)
);
create index totp_accounts_owner_position_idx on public.totp_accounts (owner_id, position);
create index totp_accounts_group_position_idx on public.totp_accounts (group_id, position);

create table public.totp_secrets (
  account_id uuid primary key references public.totp_accounts (id) on delete cascade,
  secret     text not null                              -- Base32，或加密群組的 enc:v1:...
);

-- 單筆驗證碼覆寫
create table public.group_account_overwrites (
  account_id  uuid references public.totp_accounts (id) on delete cascade,
  target_type text check (target_type in ('role', 'member')),
  target_id   uuid,                                    -- group_roles.id 或 profiles.id
  allow       bigint not null default 0,
  deny        bigint not null default 0,
  primary key (account_id, target_type, target_id)
);

-- ---------- 邀請 ----------

-- 邀請連結
create table public.group_invites (
  code       text primary key,                         -- 16 碼 URL 安全 base64（new_invite_code）
  group_id   uuid not null references public.groups (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,                              -- group_invite_create 一律會設（預設 7 天、最長 30 天）
  max_uses   int,                                      -- null = 不限
  uses       int not null default 0,
  revoked_at timestamptz
);
create index group_invites_group_idx on public.group_invites (group_id);

-- Email / @ID 邀請（對方接受或拒絕後刪除）
create table public.group_email_invites (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  email      text not null,                            -- 小寫
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (group_id, email)
);
create index group_email_invites_email_idx on public.group_email_invites (email);

-- ---------- 稽核紀錄 ----------

-- 操作紀錄。跟某位使用者有關的帳號事件寫成 group_id null、target_type 'user'、target_id = 使用者 id
-- （所以有 VIEW_AUDIT_LOG 的人在全站操作紀錄也看得到）
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  group_id    uuid references public.groups (id) on delete cascade, -- null = 全站
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,                           -- 例如 'group.role.update'
  target_type text,
  target_id   text,
  detail      jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index audit_logs_group_idx on public.audit_logs (group_id, id desc);
-- 「跟這位使用者有關的紀錄」查詢用
create index audit_logs_target_idx on public.audit_logs (target_type, target_id, id desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, id desc);

-- 登入紀錄（量大，獨立一張表）：每次登入一筆（同一個 session 只記一筆），由 /api/record-login 用 service role 寫入。
-- 為了追查重複開帳號、濫用後刪帳號，刪除帳號後仍保留：user_id 不設 FK（不跟著 profile 刪），
-- 並記下登入當時的 email；一律保留一年，由 /api/record-login 每次寫入時刪掉一年前的紀錄
create table public.login_history (
  id          bigserial primary key,
  user_id     uuid not null,
  created_at  timestamptz not null default now(),
  ip          text,
  device      text,          -- 「OS · 瀏覽器」
  user_agent  text,          -- 完整 user-agent（截斷 512 字）
  provider    text,          -- 登入方式：google / email（auth user 的 app_metadata.provider）
  email       text,          -- 登入當時的 email（帳號刪除後靠它辨識是誰）
  session_id  uuid           -- access token 的 session_id claim；同一個 session 已經有紀錄就不再新增
);
create index login_history_user_idx on public.login_history (user_id, created_at desc);
create index login_history_created_idx on public.login_history (created_at);
create index login_history_session_idx on public.login_history (user_id, session_id);

-- 加密密碼的託管密文（esc:v1:...，用團隊的公鑰加密，只有離線的私鑰解得開；格式見 scripts/escrow.mjs）。
-- 設定 / 變更加密密碼時由 totp_set_vault 寫入，舊資料由 vault_escrow_put 補登。
-- user_id 不設 FK：刪除帳號時記下 account_deleted_at，之後保留一年，由 prune_retention()（/api/record-login 呼叫）刪掉
create table public.vault_escrow (
  id          bigserial primary key,
  user_id     uuid not null,
  email       text,                                    -- 寫入當時的 email（帳號刪除後靠它辨識是誰）
  key_id      text not null,                           -- 團隊公鑰的 key id（esc:v1:<kid>:...）
  envelope    text not null,
  vault_check text not null,                           -- 這組密碼對應的 profiles.vault.check
  created_at  timestamptz not null default now(),
  account_deleted_at timestamptz                       -- 帳號刪除的時間（profiles_delete_owned_groups 寫入）；null = 帳號還在
);
create index vault_escrow_user_idx on public.vault_escrow (user_id, created_at);

-- ---------- 即時同步 ----------

-- 每位使用者「哪裡變了」的訊號，一列一個 topic，只存時間（設計說明見「13. 即時同步」）
create table public.sync_signals (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,                             -- 不設 FK：刪 profile 時由觸發器清掉，避免 cascade 順序擋到刪帳號
  topic      text not null,
  changed_at timestamptz not null default now(),
  unique (user_id, topic)
);

-- App 用 Realtime 訂閱自己的列：authenticated 只能 select，policy 只看得到自己的列（不依賴任何函式）
create policy "sync_signals_select_own"
  on public.sync_signals for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------- 登入裝置 ----------

-- App 記下「這個 session 是哪台裝置」（設計說明見「14. 登入裝置」）。key 是 access token 的 session_id claim。
-- 不對 auth.sessions 建外鍵（不依賴 auth schema 的 REFERENCES 權限）：session 被刪掉後留下的列
-- 在 list_my_sessions 不會出現，下次寫入時由觸發器清掉。
create table public.session_devices (
  session_id    uuid primary key default (nullif(auth.jwt() ->> 'session_id', '')::uuid),
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  device_name   text check (char_length(device_name) <= 100),
  -- ios / android / macos / linux / windows
  platform      text check (char_length(platform) <= 32),
  app_version   text check (char_length(app_version) <= 32),
  created_at    timestamptz not null default now(),
  -- App 啟動、登入、換 token 時更新
  last_seen_at  timestamptz not null default now(),
  -- 推播 token（Android 的 FCM token）：只能透過 register_push_token 寫（session_devices_guard 擋直接改）；
  -- 同一個 token 只會留在一列（換帳號登入時清掉舊的那列）
  push_token      text check (char_length(push_token) <= 4096),
  push_updated_at timestamptz
);
create index session_devices_user_idx on public.session_devices (user_id);
-- token 可能很長，用 md5 建唯一索引（同一個 token 只能在一列）
create unique index session_devices_push_token_key on public.session_devices (md5(push_token)) where push_token is not null;

-- RLS：只能讀自己的、只能寫「目前這個 session」的那一列（別的 session 的裝置資料改不到）
create policy "session_devices_select_own"
  on public.session_devices for select
  using (user_id = auth.uid());

create policy "session_devices_insert_own"
  on public.session_devices for insert
  with check (user_id = auth.uid() and session_id = (nullif(auth.jwt() ->> 'session_id', '')::uuid));

create policy "session_devices_update_own"
  on public.session_devices for update
  using (user_id = auth.uid() and session_id = (nullif(auth.jwt() ->> 'session_id', '')::uuid))
  with check (user_id = auth.uid() and session_id = (nullif(auth.jwt() ->> 'session_id', '')::uuid));

-- ---------- 通知、公告、全站設定 ----------

-- 全站設定（key → jsonb）：notify_admin_changes（後台修改帳號時要不要通知本人）、min_app_version（App 最低版本）
create table public.site_settings (
  key        text primary key,
  value      jsonb not null default 'null'::jsonb,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- 後台發的公告（操作紀錄，一律保留）；filter 是發送時的對象條件
create table public.broadcasts (
  id           bigint generated always as identity primary key,
  kind         text not null check (kind in ('important', 'update', 'promo', 'other')),
  title        text not null check (char_length(title) between 1 and 100),
  body         text not null default '' check (char_length(body) <= 500),
  link         text check (char_length(link) <= 500 and link ~ '^/' and link !~ '^//'),
  filter       jsonb not null default '{}'::jsonb,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  user_count   int not null default 0,
  device_count int not null default 0,
  push_count   int not null default 0
);
create index broadcasts_created_idx on public.broadcasts (created_by, created_at desc);

-- 每位使用者的通知（鈴鐺）。標題與內文由資料庫產生（固定的中文句型），網站與 App 直接顯示。
-- push_state：pending 等推播、sending Edge Function 領取中、sent 處理完、skipped 不推播（使用者關掉這一種，或太舊）
-- push_sessions：公告有裝置條件時只推播到這些 session（null = 他所有的裝置）；exclude_session：推播不送的 session
-- 保留一年（prune_retention）；刪帳號時跟著刪除
create table public.notifications (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  category        text not null check (category in ('system', 'account', 'feature')),
  type            text not null check (char_length(type) <= 64),
  title           text not null check (char_length(title) <= 100),
  body            text not null default '' check (char_length(body) <= 500),
  link            text check (char_length(link) <= 500 and link ~ '^/' and link !~ '^//'),
  data            jsonb not null default '{}'::jsonb,
  broadcast_id    bigint references public.broadcasts (id) on delete set null,
  exclude_session uuid,
  push_sessions   uuid[],
  created_at      timestamptz not null default now(),
  read_at         timestamptz,
  push_state      text not null default 'pending' check (push_state in ('pending', 'sending', 'sent', 'skipped')),
  push_claimed_at timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_push_idx on public.notifications (push_state, created_at) where push_state in ('pending', 'sending');
create index notifications_created_idx on public.notifications (created_at);

-- 每位使用者的通知開關：overrides 只存和預設不同的（{ "<type>": true | false }）
create table public.notification_prefs (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  overrides  jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- Row Level Security ----------
-- 上面有 policy 的三張表（profiles、sync_signals、session_devices）以外都不建 policy：
-- 一般使用者無法直接讀寫，一律走 security definer 的 RPC
alter table public.totp_accounts enable row level security;
alter table public.totp_secrets enable row level security;
alter table public.site_roles enable row level security;
alter table public.site_user_roles enable row level security;
alter table public.site_pending_roles enable row level security;
alter table public.site_owner enable row level security;
alter table public.groups enable row level security;
alter table public.group_roles enable row level security;
alter table public.group_members enable row level security;
alter table public.group_member_roles enable row level security;
alter table public.group_bans enable row level security;
alter table public.group_invites enable row level security;
alter table public.group_email_invites enable row level security;
alter table public.group_account_overwrites enable row level security;
alter table public.audit_logs enable row level security;
alter table public.login_history enable row level security;
alter table public.vault_escrow enable row level security;
alter table public.sync_signals enable row level security;
alter table public.session_devices enable row level security;
alter table public.site_settings enable row level security;
alter table public.broadcasts enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_prefs enable row level security;


-- ============================================================
-- 3. 共用 helper（只給 security definer 函式用，一般使用者不能直接呼叫）
-- ============================================================

-- 目前登入者；未登入就 raise
create function public.require_uid()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception '請先登入';
  end if;
  return uid;
end;
$$;

-- 使用者的 email（小寫）：只回傳已驗證的 auth.users.email；沒有 auth.users 那列時才用 profiles.email
create function public.user_email(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(case
    when exists (select 1 from auth.users u where u.id = p_uid)
      then (select u.email from auth.users u where u.id = p_uid and u.email_confirmed_at is not null)
    else (select p.email from profiles p where p.id = p_uid)
  end);
$$;

-- 使用者顯示名稱（紀錄 detail.name 用）：名稱 → @ID → email（auth.users 優先）
create function public.display_name(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(p.name, ''), p.username, (select u.email from auth.users u where u.id = p.id), p.email)
  from profiles p where p.id = p_uid;
$$;

-- SiteUserBrief：{ id, name, username, photo_url, email }；with_email false 時 email 是 null（email 以 auth.users 為準）
create function public.user_brief(p_uid uuid, p_with_email boolean)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'username', p.username, 'photo_url', p.photo_url,
    'email', case when p_with_email then coalesce((select u.email from auth.users u where u.id = p.id), p.email) end
  )
  from profiles p
  where p.id = p_uid;
$$;

-- 寫一筆操作紀錄（gid null = 全站）
create function public.audit(p_gid uuid, p_actor uuid, p_action text, p_target_type text, p_target_id text, p_detail jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into audit_logs (group_id, actor_id, action, target_type, target_id, detail)
  values (p_gid, p_actor, p_action, p_target_type, p_target_id, coalesce(p_detail, '{}'::jsonb));
$$;

-- 網站管理員（管理員、管理所有群組）不是群組成員、靠網站權限查看時，操作紀錄的 detail 加上 via_site：
-- 群組的操作紀錄與使用者自己的紀錄不顯示，只在後台看得到
create function public.audit_via_site(p_gid uuid, p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when exists (select 1 from group_members m where m.group_id = p_gid and m.user_id = p_uid)
              then '{}'::jsonb else '{"via_site": true}'::jsonb end;
$$;

-- 檢查身分組顏色：'' 或 '#rrggbb'（存小寫）
create function public.norm_color(v text)
returns text
language plpgsql
immutable
as $$
declare
  c text := lower(trim(coalesce(v, '')));
begin
  if c <> '' and c !~ '^#[0-9a-f]{6}$' then
    raise exception '顏色格式不正確，請使用 #rrggbb';
  end if;
  return c;
end;
$$;

-- 檢查身分組名稱：去頭尾空白、1～50 字
create function public.norm_role_name(v text)
returns text
language plpgsql
immutable
as $$
declare
  n text := trim(coalesce(v, ''));
begin
  if n = '' then
    raise exception '請輸入身分組名稱';
  end if;
  if char_length(n) > 50 then
    raise exception '身分組名稱最多 50 個字';
  end if;
  return n;
end;
$$;


-- ============================================================
-- 4. 全站身分組與權限
-- 階層：只有全站擁有者（site_owner）不受限；其他人（含 ADMINISTRATOR）只能管理最高身分組比自己低的使用者、
-- 比自己最高身分組低的身分組，同位的互相管不到，除了擁有者沒有人能管理擁有者。
-- 還沒有擁有者時，照舊由「最高位身分組的持有者」不受限。
-- 最後一位管理員保護：拿掉最後一位擁有 ADMINISTRATOR 的使用者時 raise（整個 RPC 回滾）
-- ============================================================

-- 全站權限中文名稱（錯誤訊息用）
create function public.site_perm_name(p_bit bigint)
returns text
language sql
immutable
as $$
  select case p_bit
    when 1 then '管理員' when 2 then '進入後台' when 4 then '查看使用者' when 8 then '管理使用者'
    when 16 then '查看使用者的 2FA' when 32 then '管理使用者的 2FA' when 64 then '管理身分組'
    when 128 then '查看操作紀錄' when 256 then '建立群組' when 512 then '管理所有群組'
    when 1024 then '發送通知'
    else p_bit::text end;
$$;

-- 全站權限：@everyone OR 該使用者所有身分組；含 ADMINISTRATOR → SITE_ALL
create function public.site_permissions(p_uid uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  perms bigint;
begin
  if p_uid is null then
    return 0;
  end if;
  select coalesce(bit_or(r.permissions), 0) into perms
  from site_roles r
  where r.is_default
     or r.id in (select ur.role_id from site_user_roles ur where ur.user_id = p_uid);
  if perms & 1 <> 0 then
    return 2047;
  end if;
  return perms & 2047;
end;
$$;

-- 使用者在全站的最高位置（沒有身分組時 0）
create function public.site_top_position(p_uid uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(r.position), 0)
  from site_user_roles ur
  join site_roles r on r.id = ur.role_id
  where ur.user_id = p_uid and not r.is_default;
$$;

-- 是否為全站擁有者
create function public.site_is_owner(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_uid is not null and exists (select 1 from site_owner o where o.user_id = p_uid);
$$;

-- 不受全站階層限制的人：有擁有者時只有擁有者；還沒有擁有者時是「最高位身分組的持有者」：
-- 自己有身分組，而且沒有人的最高身分組比自己高（只看有人持有的身分組，避免最上面的身分組沒人時整個後台沒人管得到）
create function public.site_is_root(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from site_owner o where o.user_id is not null) then site_is_owner(p_uid)
    else site_top_position(p_uid) > 0
     and site_top_position(p_uid) >= (
       select coalesce(max(r.position), 0)
       from site_user_roles ur join site_roles r on r.id = ur.role_id
       where not r.is_default
     )
  end;
$$;

-- 沒有指定的全站權限就 raise；回傳展開後的權限
create function public.site_require(p_uid uuid, p_bit bigint)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  perms bigint := site_permissions(p_uid);
begin
  if perms & p_bit = 0 then
    raise exception '權限不足：需要「%」', site_perm_name(p_bit);
  end if;
  return perms;
end;
$$;

-- 全站階層：能不能管理這個 position 的身分組（擁有者不受限）
create function public.site_can_manage_position(p_uid uuid, p_position int)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select site_is_root(p_uid) or p_position < site_top_position(p_uid);
$$;

-- 全站階層：能不能管理這位使用者（擁有者不受限；其他人只能管最高身分組比自己低的人，而且管不到擁有者）
create function public.site_can_manage_user(p_uid uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select site_is_root(p_uid)
      or (not site_is_owner(p_target) and site_top_position(p_target) < site_top_position(p_uid));
$$;

-- 目前擁有全站 ADMINISTRATOR 的使用者數量
create function public.site_admin_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from site_roles where is_default and permissions & 1 <> 0)
      then (select count(*) from profiles)
    else (
      select count(distinct ur.user_id)
      from site_user_roles ur
      join site_roles r on r.id = ur.role_id
      where r.permissions & 1 <> 0
    )
  end;
$$;

-- 最後一位管理員保護：變更前有管理員、變更後沒有 → raise（整個 RPC 會回滾）。
-- 先拿 advisory lock 再數，兩個交易同時拿掉管理員時，後面那個會看到前面的結果
-- （volatile，lock 之後的查詢才會拿到新的 snapshot）
create function public.site_assert_admin_left(p_before bigint)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('site_admins'));
  if p_before > 0 and site_admin_count() = 0 then
    raise exception '至少要保留一位擁有「管理員」權限的使用者';
  end if;
end;
$$;

-- 全站身分組：依 position 由高到低重新編號為 n..1（@everyone 維持 0）
create function public.site_roles_renumber()
returns void
language sql
security definer
set search_path = public
as $$
  update site_roles r
  set position = s.rn
  from (
    select id, (count(*) over ()) - row_number() over (order by position desc, created_at, id) + 1 as rn
    from site_roles where not is_default
  ) s
  where r.id = s.id and r.position <> s.rn;
$$;

-- 自己的全站權限（已展開）、最高位置、是不是全站擁有者、身分組（不含 @everyone，由高到低）；未登入回傳 null
create function public.me_permissions()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return null;
  end if;
  return jsonb_build_object(
    'permissions', site_permissions(uid),
    'top_position', site_top_position(uid),
    'is_owner', site_is_owner(uid),
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'color', r.color, 'position', r.position)
                       order by r.position desc, r.created_at)
      from site_user_roles ur join site_roles r on r.id = ur.role_id
      where ur.user_id = uid and not r.is_default
    ), '[]'::jsonb)
  );
end;
$$;

-- 全站擁有者的使用者 id（VIEW_ADMIN；還沒有擁有者時 null），後台顯示「擁有者」用
create function public.site_owner()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
begin
  perform site_require(uid, 2);
  return (select o.user_id from site_owner o limit 1);
end;
$$;

-- 全站身分組列表（VIEW_ADMIN）：由高到低
create function public.site_roles_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
begin
  perform site_require(uid, 2);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'name', r.name, 'color', r.color, 'position', r.position, 'permissions', r.permissions,
      'is_default', r.is_default,
      'member_count', case when r.is_default then (select count(*) from profiles)
                           else (select count(*) from site_user_roles ur where ur.role_id = r.id) end
    ) order by r.is_default, r.position desc, r.created_at)
    from site_roles r
  ), '[]'::jsonb);
end;
$$;

-- 建立全站身分組（MANAGE_ROLES；只能開自己有的位元）：position = 1，其他 ≥ 1 的全部 +1
create function public.site_role_create(name text, color text, permissions bigint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_name text := norm_role_name(site_role_create.name);
  p_color text := norm_color(site_role_create.color);
  p_perms bigint := coalesce(site_role_create.permissions, 0) & 2047;
  mine bigint;
  rid uuid;
begin
  mine := site_require(uid, 64);
  if p_perms & ~mine <> 0 then
    raise exception '只能開啟你自己擁有的權限';
  end if;
  update site_roles r set position = r.position + 1 where not r.is_default and r.position >= 1;
  insert into site_roles (name, color, position, permissions)
  values (p_name, p_color, 1, p_perms) returning id into rid;
  perform audit(null, uid, 'site.role.create', 'role', rid::text,
                jsonb_build_object('name', p_name, 'color', p_color, 'permissions', p_perms));
  return rid;
end;
$$;

-- 編輯全站身分組（MANAGE_ROLES + 階層 + 只能開自己有的位元）；@everyone 只能改 permissions（position 0，有身分組的人都管得到）；
-- 最後一位管理員保護
create function public.site_role_update(role_id uuid, name text, color text, permissions bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  r site_roles%rowtype;
  p_name text;
  p_color text;
  p_perms bigint;
  mine bigint;
  admins bigint := site_admin_count();
begin
  select * into r from site_roles where id = site_role_update.role_id;
  if r.id is null then
    raise exception '找不到這個身分組';
  end if;
  mine := site_require(uid, 64);
  if not site_can_manage_position(uid, r.position) then
    raise exception '只能管理比你目前最高身分組還低的身分組 / 成員';
  end if;

  p_perms := coalesce(site_role_update.permissions, r.permissions) & 2047;
  if p_perms & ~r.permissions & ~mine <> 0 then
    raise exception '只能開啟你自己擁有的權限';
  end if;
  if r.is_default then
    p_name := r.name;
    p_color := r.color;
  else
    p_name := case when site_role_update.name is null then r.name else norm_role_name(site_role_update.name) end;
    p_color := case when site_role_update.color is null then r.color else norm_color(site_role_update.color) end;
  end if;

  update site_roles x set name = p_name, color = p_color, permissions = p_perms where x.id = r.id;
  perform site_assert_admin_left(admins);
  perform audit(null, uid, 'site.role.update', 'role', r.id::text, jsonb_build_object(
    'name', p_name, 'color', p_color, 'permissions', p_perms, 'old_permissions', r.permissions));
end;
$$;

-- 刪除全站身分組（MANAGE_ROLES + 階層）；@everyone 不能刪；最後一位管理員保護
create function public.site_role_delete(role_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  r site_roles%rowtype;
  admins bigint := site_admin_count();
  holders uuid[];
begin
  select * into r from site_roles where id = site_role_delete.role_id;
  if r.id is null then
    raise exception '找不到這個身分組';
  end if;
  perform site_require(uid, 64);
  if r.is_default then
    raise exception '@everyone 不能刪除';
  end if;
  if not site_can_manage_position(uid, r.position) then
    raise exception '只能管理比你目前最高身分組還低的身分組 / 成員';
  end if;
  holders := array(select ur.user_id from site_user_roles ur where ur.role_id = r.id);
  delete from site_roles x where x.id = r.id;
  perform site_assert_admin_left(admins);
  perform site_roles_renumber();
  perform audit(null, uid, 'site.role.delete', 'role', r.id::text, jsonb_build_object('name', r.name));
  -- 持有這個身分組的人：網站身分組變了（後台可以整個關掉）
  if notify_admin_change_enabled('role') then
    perform notify(holders, 'admin_changed_role', '網站身分組已變更',
                   format('%s 刪除了網站身分組「%s」。', notify_name(uid), r.name), '/me/update_info',
                   jsonb_build_object('actor_id', uid, 'role_id', r.id, 'role_name', r.name, 'deleted', true));
  end if;
end;
$$;

-- 全站身分組排序（MANAGE_ROLES）：role_ids = 由高到低的完整順序（不含 @everyone）；
-- 擁有者不受限，其他人（含一般管理員）管不到的身分組排名不能變
create function public.site_roles_reorder(role_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_ids uuid[] := coalesce(site_roles_reorder.role_ids, '{}');
  n int;
  is_root boolean;
  top int;
begin
  perform site_require(uid, 64);
  select count(*) into n from site_roles where not is_default;
  if cardinality(p_ids) <> n
     or (select count(distinct x) from unnest(p_ids) x) <> n
     or exists (select 1 from unnest(p_ids) x where not exists (
                  select 1 from site_roles r where r.id = x and not r.is_default)) then
    raise exception '身分組清單不完整，請重新整理後再試';
  end if;

  is_root := site_is_root(uid);
  top := site_top_position(uid);

  if not is_root and exists (
    select 1
    from (
      select r.id, r.position,
             n - row_number() over (order by r.position desc, r.created_at, r.id) + 1 as old_rank
      from site_roles r where not r.is_default
    ) cur
    join unnest(p_ids) with ordinality as x(id, ord) on x.id = cur.id
    where cur.position >= top and cur.old_rank <> n - x.ord + 1
  ) then
    raise exception '只能管理比你目前最高身分組還低的身分組 / 成員';
  end if;

  update site_roles r set position = n - x.ord + 1
  from unnest(p_ids) with ordinality as x(id, ord)
  where r.id = x.id;

  perform audit(null, uid, 'site.role.reorder', 'role', null, jsonb_build_object('role_ids', p_ids));
end;
$$;

-- 指派使用者全站身分組（MANAGE_ROLES + 階層）：只改呼叫者管得到的身分組，管不到的維持原樣；
-- 擁有者不受階層限制；新加入的身分組權限必須是自己權限的子集（ADMINISTRATOR 視為全有）；
-- 最後一位管理員保護
create function public.site_set_user_roles(user_id uuid, role_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_target uuid := site_set_user_roles.user_id;
  p_roles uuid[] := coalesce(site_set_user_roles.role_ids, '{}');
  mine bigint;
  is_root boolean;
  top int;
  added uuid[];
  removed uuid[];
  admins bigint := site_admin_count();
begin
  mine := site_require(uid, 64);
  if not exists (select 1 from profiles where id = p_target) then
    raise exception '找不到這位使用者';
  end if;
  if not site_can_manage_user(uid, p_target) then
    raise exception '只能管理比你目前最高身分組還低的身分組 / 成員';
  end if;
  if exists (
    select 1 from unnest(p_roles) as x(id)
    where not exists (select 1 from site_roles r where r.id = x.id and not r.is_default)
  ) then
    raise exception '找不到指定的身分組';
  end if;

  is_root := site_is_root(uid);
  top := site_top_position(uid);

  select array_agg(r.id) into added
  from site_roles r
  where r.id = any (p_roles)
    and not exists (select 1 from site_user_roles ur where ur.user_id = p_target and ur.role_id = r.id);
  if exists (select 1 from site_roles r where r.id = any (coalesce(added, '{}')) and not is_root and r.position >= top) then
    raise exception '只能管理比你目前最高身分組還低的身分組 / 成員';
  end if;
  -- site_permissions 已把 ADMINISTRATOR 展開成全部；最高位持有者也不能指派自己沒有的權限（避免自己升權）
  if exists (select 1 from site_roles r where r.id = any (coalesce(added, '{}')) and r.permissions & 2047 & ~mine <> 0) then
    raise exception '只能指派權限不超過你自己的身分組';
  end if;

  select array_agg(ur.role_id) into removed
  from site_user_roles ur join site_roles r on r.id = ur.role_id
  where ur.user_id = p_target
    and not (ur.role_id = any (p_roles))
    and (is_root or r.position < top);

  delete from site_user_roles ur where ur.user_id = p_target and ur.role_id = any (coalesce(removed, '{}'));
  insert into site_user_roles (user_id, role_id)
  select p_target, x from unnest(coalesce(added, '{}')) as x
  on conflict do nothing;

  perform site_assert_admin_left(admins);

  if coalesce(array_length(added, 1), 0) + coalesce(array_length(removed, 1), 0) > 0 then
    perform audit(null, uid, 'site.user.roles', 'user', p_target::text,
                  jsonb_build_object('name', display_name(p_target), 'added', coalesce(added, '{}'), 'removed', coalesce(removed, '{}')));
    -- 通知本人（後台可以整個關掉；改自己的不通知）
    if p_target <> uid and notify_admin_change_enabled('role') then
      perform notify(array[p_target], 'admin_changed_role', '網站身分組已變更',
        format('%s 變更了你的網站身分組（%s）。', notify_name(uid), array_to_string(array_remove(array[
          '新增：' || (select string_agg(r.name, '、' order by r.position desc) from site_roles r where r.id = any (coalesce(added, '{}'))),
          '移除：' || (select string_agg(r.name, '、' order by r.position desc) from site_roles r where r.id = any (coalesce(removed, '{}')))
        ], null), '；')),
        '/me/update_info',
        jsonb_build_object('actor_id', uid, 'added', coalesce(added, '{}'), 'removed', coalesce(removed, '{}')));
    end if;
  end if;
end;
$$;

-- 把 site_pending_roles 中 email 符合的身分組指派給使用者並刪除；
-- 有指派到身分組時記一筆 site.user.roles（操作者 null = 系統）。
-- 還沒有擁有者、而且 site_owner.pending_email 是這個 email 時，接上全站擁有者
create function public.apply_pending_roles(p_uid uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e text := lower(trim(coalesce(p_email, '')));
  added uuid[];
begin
  if p_uid is null or e = '' or not exists (select 1 from profiles where id = p_uid) then
    return;
  end if;
  with ins as (
    insert into site_user_roles (user_id, role_id)
    select p_uid, pr.role_id from site_pending_roles pr where pr.email = e
    on conflict do nothing
    returning role_id
  )
  select array_agg(ins.role_id) into added from ins;
  delete from site_pending_roles where email = e;

  -- 還沒有擁有者、而且 pending_email 是這個 email：接上擁有者
  update site_owner o set user_id = p_uid, pending_email = null
  where o.user_id is null and o.pending_email = e;

  if added is not null then
    perform audit(null, null, 'site.user.roles', 'user', p_uid::text, jsonb_build_object(
      'name', coalesce(display_name(p_uid), p_uid::text), 'added', added, 'removed', '{}'::uuid[], 'pending', true));
  end if;
end;
$$;


-- ============================================================
-- 5. 個人資料與 @ID
-- @ID 存小寫，寫入前一律經過 username_normalize（trim、轉小寫、去掉開頭的 @），
-- 所以大小寫或前後空白不同也算同一個；profiles_username_key 唯一索引擋重複。
-- @ID 不能看起來像 UUID，也不能和網站路由同名，避免 /u/<參數> 分不清是 id 還是 @ID。
-- 已經在用、但後來變成保留字的 @ID 不會被清掉（觸發器只在 @ID 改變時檢查）。
-- ============================================================

-- 看起來像 UUID：整個是 32 位十六進位，或含 8-4-4-4-12 的形狀（格式本來就不允許連字號，保險起見仍檢查）
create function public.username_uuid_like(v text)
returns boolean
language sql
immutable
as $$
  select coalesce(v, '') ~* '^[0-9a-f]{32}$'
      or coalesce(v, '') ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
$$;

-- 保留字（不能當 @ID）：系統名稱 + 網站路由 + 看起來像 UUID 的名字
create function public.username_reserved(v text)
returns boolean
language sql
immutable
as $$
  select username_uuid_like(v)
      or v = any (array[
        -- 0008 原本的
        'admin', 'administrator', 'root', 'system', 'securibit', 'everyone',
        'here', 'support', 'help', 'null', 'undefined',
        -- 網站路由（src/app）與常見的系統路徑
        'me', 'u', 'api', 'auth', 'about', 'disclaimer', 'code', 'codes', 'addcode',
        'groups', 'group', 'invite', 'invites', 'invitation', 'invitations',
        'settings', 'setting', 'new', 'edit', 'login', 'logout', 'signin', 'signout', 'signup', 'register',
        'user', 'users', 'profile', 'profiles', 'mypage', 'update_info', 'account', 'accounts',
        'notifications', 'roles', 'audit', 'callback', 'static', 'public', 'assets',
        '_next', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'manifest.json'
      ]);
$$;

-- 正規化：轉小寫、trim、去掉開頭的 @；空字串回傳 null（代表清除）
create function public.username_normalize(v text)
returns text
language sql
immutable
as $$
  select nullif(trim(regexp_replace(lower(trim(coalesce(v, ''))), '^@', '')), '');
$$;

-- 檢查 @ID 能不能給 p_uid 使用（已正規化、不是 null）；不行就 raise
create function public.username_assert(v text, p_uid uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if v !~ '^[a-z0-9_.]{3,32}$' then
    raise exception '@ID 只能使用 3～32 個英文小寫字母、數字、底線（_）或句點（.）';
  end if;
  if username_uuid_like(v) then
    raise exception '@ID 不能是 UUID 的格式（32 位英數字）';
  end if;
  if username_reserved(v) then
    raise exception '這個 @ID 是保留字，不能使用';
  end if;
  if exists (select 1 from profiles where username = v and id is distinct from p_uid) then
    raise exception '這個 @ID 已被使用';
  end if;
end;
$$;

-- 直接改 profiles（RLS 允許改自己那列）也不能用保留字 / UUID 樣式
create function public.profiles_username_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.username is not null
     and (tg_op = 'INSERT' or new.username is distinct from old.username) then
    if username_uuid_like(new.username) then
      raise exception '@ID 不能是 UUID 的格式（32 位英數字）';
    end if;
    if username_reserved(new.username) then
      raise exception '這個 @ID 是保留字，不能使用';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_username_guard
  before insert or update of username on public.profiles
  for each row execute function public.profiles_username_guard();

-- 使用者直接改 profiles（PostgREST，current_user = authenticated）時把關，security definer 的 RPC、觸發器與 service role 不受影響：
-- - creation_time、last_sign_in_time 一律維持原值（由後端寫；舊版前端還會送，靜靜地忽略）
-- - photo_url 只接受空字串或 Google 的大頭照網址；自己上傳過（photo_custom）就維持原值
-- - bg_photo_url 只能清空；上傳大頭照與背景圖走 /api/profile/photo（service role）
-- - name 去頭尾空白、最多 64 字（超過截斷）
-- 不是 security definer：要看到呼叫者自己的 current_user
create function public.profiles_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- 只管使用者用 PostgREST 直接改自己那列；security definer 的 RPC、觸發器與 service role 不受影響
  if current_user <> 'authenticated' then
    return new;
  end if;
  -- 建立 / 登入時間由後端寫；舊版前端還會送，靜靜地維持原值
  new.creation_time := old.creation_time;
  new.last_sign_in_time := old.last_sign_in_time;
  new.photo_custom := old.photo_custom;
  -- 大頭照只接受空字串或 Google 的網址；自己上傳過的（photo_custom）不會被舊版前端每次登入送來的 Google 大頭照蓋掉
  if new.photo_url is distinct from old.photo_url
     and (old.photo_custom
          or not (coalesce(new.photo_url, '') = '' or new.photo_url ~ '^https://[a-z0-9-]+\.googleusercontent\.com/')) then
    new.photo_url := old.photo_url;
  end if;
  -- 背景圖只能清空（上傳走 /api/profile/photo）
  if new.bg_photo_url is distinct from old.bg_photo_url and coalesce(new.bg_photo_url, '') <> '' then
    new.bg_photo_url := old.bg_photo_url;
  end if;
  if new.name is distinct from old.name then
    new.name := left(trim(new.name), 64);
  end if;
  return new;
end;
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- 設定自己的 @ID；null 或空字串代表清除；回傳存進去的值
create function public.set_username(new_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v text := username_normalize(set_username.new_username);
begin
  if uid is null then
    raise exception '請先登入';
  end if;
  if v is not null then
    perform username_assert(v, uid);
  end if;

  begin
    update profiles set username = v, updated_at = now() where id = uid;
  exception when unique_violation then
    raise exception '這個 @ID 已被使用';
  end;
  if not found then
    raise exception '找不到使用者資料';
  end if;
  return v;
end;
$$;

-- 表單即時檢查：這個 @ID 能不能用（自己目前的 @ID 算可用；空字串代表清除，也算可用）
create function public.username_available(name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v text := username_normalize(username_available.name);
begin
  if v is null then
    return true;
  end if;
  if v !~ '^[a-z0-9_.]{3,32}$' or username_reserved(v) then
    return false;
  end if;
  return not exists (select 1 from profiles where username = v and id is distinct from auth.uid());
end;
$$;

-- 別人的個人頁面（/u/[id]）：登入的使用者都能看別人的公開資料：
--   id、名稱、@ID、大頭照、帳號建立時間、全站身分組（不含 @everyone，由高到低）、
--   和呼叫者「同時是成員」的群組（id、名稱）。
-- 不回傳 email、電話、登入紀錄、驗證碼、vault 等任何資訊。
create function public.user_public(user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is null then
    raise exception '請先登入';
  end if;

  select jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'username', p.username,
    'photo_url', p.photo_url,
    -- 從 Firebase 搬來的帳號以 profiles.creation_time 為準，其他用 auth.users.created_at（同 admin_user_json）
    'created_at', coalesce(nullif(p.creation_time, ''), u.created_at::text),
    'site_roles', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'color', r.color, 'position', r.position)
                       order by r.position desc, r.created_at)
      from site_user_roles ur join site_roles r on r.id = ur.role_id
      where ur.user_id = p.id and not r.is_default
    ), '[]'::jsonb),
    -- 只列雙方都是成員的群組
    'shared_groups', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) order by g.name, g.created_at)
      from groups g
      where exists (select 1 from group_members m where m.group_id = g.id and m.user_id = uid)
        and exists (select 1 from group_members m where m.group_id = g.id and m.user_id = p.id)
    ), '[]'::jsonb)
  )
  into result
  from profiles p
  left join auth.users u on u.id = p.id
  where p.id = user_public.user_id;

  if result is null then
    raise exception '找不到這位使用者';
  end if;
  return result;
end;
$$;

-- 用 @ID 查別人的公開資料（/u/<username>；大小寫、前後空白、開頭的 @ 都不影響）；回傳同 user_public(uuid)
create function public.user_public_by_username(name text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v text := username_normalize(user_public_by_username.name);
  target uuid;
begin
  if uid is null then
    raise exception '請先登入';
  end if;
  if v is not null then
    select p.id into target from profiles p where p.username = v;
  end if;
  if target is null then
    raise exception '找不到這位使用者';
  end if;
  return user_public(target);
end;
$$;


-- ============================================================
-- 6. 帳號建立與登入
-- email 驗證過才接回 Firestore 舊資料（legacy_import）、套用 site_pending_roles、比對 Email 邀請，
-- 避免有人用別人的 email 註冊後冒領。
-- ============================================================

-- email 已驗證時：接回 legacy_import（搬進已存在的 profile）並套用 site_pending_roles；未驗證時什麼都不做，
-- 資料留在暫存表，等之後登入（ensure_profile）發現已驗證再套
create function public.claim_verified_email(p_uid uuid, p_email text, p_confirmed_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  legacy public.legacy_import%rowtype;
begin
  if p_uid is null or p_confirmed_at is null or coalesce(p_email, '') = ''
     or not exists (select 1 from profiles where id = p_uid) then
    return;
  end if;

  select * into legacy from legacy_import where email = p_email;
  if legacy.email is not null then
    -- 寫進 profiles.totp 會由 0008 的觸發器轉存到 totp_accounts
    update profiles p
    set name = coalesce(legacy.name, p.name),
        photo_url = coalesce(legacy.photo_url, p.photo_url),
        bg_photo_url = coalesce(legacy.bg_photo_url, p.bg_photo_url),
        phone_number = coalesce(nullif(legacy.phone_number, ''), p.phone_number),
        totp = coalesce(legacy.totp, '[]'::jsonb),
        migrated = true
    where p.id = p_uid;
    -- 舊資料一次性接回後刪除
    delete from legacy_import where email = p_email;
  end if;

  perform apply_pending_roles(p_uid, p_email);
end;
$$;

-- 新使用者註冊時自動建立 profile；email 已驗證（例如 Google 登入）才接回舊資料與套用 pending roles
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, email, name, photo_url, bg_photo_url,
    email_verified, phone_number, creation_time, last_sign_in_time
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    '',
    (new.email_confirmed_at is not null),
    '',
    coalesce(new.created_at::text, ''),
    coalesce(new.last_sign_in_at::text, '')
  )
  on conflict (id) do nothing;

  perform public.claim_verified_email(new.id, new.email, new.email_confirmed_at);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 登入時自我修復（不依賴 auth.users 觸發器，該觸發器在 Supabase 常因權限不生效）：
-- 確保使用者有 profile、同步 email 與驗證狀態、確保有預設群組（例如預設群組被管理員刪掉），
-- email 驗證過才接回舊資料與套用 pending roles
create function public.ensure_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  u auth.users%rowtype;
begin
  if uid is null then
    return;
  end if;

  select * into u from auth.users where id = uid;
  if u.id is null then
    return;
  end if;

  insert into public.profiles (
    id, email, name, photo_url, bg_photo_url,
    email_verified, phone_number, creation_time, last_sign_in_time
  )
  values (
    uid,
    u.email,
    coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
    coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture'),
    '',
    (u.email_confirmed_at is not null),
    '',
    coalesce(u.created_at::text, ''),
    coalesce(u.last_sign_in_at::text, '')
  )
  on conflict (id) do nothing;

  -- email 與驗證狀態以 auth.users 為準（前端不能直接改這兩個欄位）
  update public.profiles p
  set email = u.email, email_verified = (u.email_confirmed_at is not null)
  where p.id = uid
    and (p.email is distinct from u.email or p.email_verified is distinct from (u.email_confirmed_at is not null));

  perform public.ensure_default_group(uid);
  perform public.claim_verified_email(uid, u.email, u.email_confirmed_at);
end;
$$;

-- 舊資料要放的群組：預設群組；預設群組已加密（舊資料是明文）就另外建立一個沒加密的群組
create function public.legacy_target_group(p_uid uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid := ensure_default_group(p_uid);
begin
  if gid is not null and exists (select 1 from groups g where g.id = gid and g.encrypted) then
    gid := group_insert(p_uid, '舊版驗證碼', '從舊版網站接回的驗證碼');
  end if;
  return gid;
end;
$$;

-- 寫進 profiles.totp 的資料（接回 Firestore 舊資料、舊版前端寫入）自動轉存到群組，再清空 profiles.totp
create function public.profiles_totp_to_accounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.totp is not null and jsonb_typeof(new.totp) = 'array' and jsonb_array_length(new.totp) > 0 then
    perform totp_import_items(null, legacy_target_group(new.id), new.totp, new.id);
    update profiles set totp = '[]'::jsonb where id = new.id;
  end if;
  return null;
end;
$$;

create trigger profiles_totp_to_accounts
  after insert or update of totp on public.profiles
  for each row execute function public.profiles_totp_to_accounts();


-- ============================================================
-- 7. 群組
-- - 每個使用者都有一個預設群組（profiles.default_group_id，只能指向自己擁有的群組）；
--   新 profile 自動建立「<名稱>的群組」。
-- - 預設群組不能刪；自己擁有的群組只剩一個也不能刪；轉移預設群組時自動把預設改到自己擁有的另一個群組，沒有就擋。
-- - 刪除帳號：只擋「還擁有有其他成員的群組」；只有自己一個人的群組（含預設群組）跟著帳號一起刪除。
-- ============================================================

-- ---------- 權限計算 ----------

-- 群組權限中文名稱（錯誤訊息用）
create function public.group_perm_name(p_bit bigint)
returns text
language sql
immutable
as $$
  select case p_bit
    when 1 then '群組管理員' when 2 then '查看驗證碼' when 4 then '查看金鑰' when 8 then '管理驗證碼'
    when 16 then '邀請成員' when 32 then '移除成員' when 64 then '管理身分組'
    when 128 then '管理群組' when 256 then '查看操作紀錄' when 512 then '封鎖成員'
    else p_bit::text end;
$$;

-- 是否為群組成員
create function public.group_is_member(p_gid uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from group_members where group_id = p_gid and user_id = p_uid);
$$;

-- 在群組裡視同擁有者：擁有者、全站 ADMINISTRATOR、全站 MANAGE_GROUPS（不受群組階層限制）
create function public.group_is_super(p_gid uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from groups where id = p_gid and owner_id = p_uid)
      or site_permissions(p_uid) & (1 | 512) <> 0;
$$;

-- 群組基礎權限：擁有者 / 全站 ADMINISTRATOR / MANAGE_GROUPS → GROUP_ALL；
-- 非成員 0；否則 @everyone OR 成員所有身分組，含 ADMINISTRATOR → GROUP_ALL
create function public.group_permissions(p_gid uuid, p_uid uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  perms bigint;
begin
  if p_uid is null or not exists (select 1 from groups where id = p_gid) then
    return 0;
  end if;
  if group_is_super(p_gid, p_uid) then
    return 1023;
  end if;
  if not group_is_member(p_gid, p_uid) then
    return 0;
  end if;
  select coalesce(bit_or(r.permissions), 0) into perms
  from group_roles r
  where r.group_id = p_gid
    and (r.is_default
         or r.id in (select mr.role_id from group_member_roles mr where mr.group_id = p_gid and mr.user_id = p_uid));
  if perms & 1 <> 0 then
    return 1023;
  end if;
  return perms & 1023;
end;
$$;

-- 成員在群組的最高位置（沒有身分組時 0）
create function public.group_top_position(p_gid uuid, p_uid uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(r.position), 0)
  from group_member_roles mr
  join group_roles r on r.id = mr.role_id
  where mr.group_id = p_gid and mr.user_id = p_uid and not r.is_default;
$$;

-- 群組存在、呼叫者是成員（或視同擁有者）且有指定權限，否則 raise；回傳基礎權限
create function public.group_require(p_gid uuid, p_uid uuid, p_bit bigint)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  perms bigint;
begin
  if not exists (select 1 from groups where id = p_gid) then
    raise exception '找不到這個群組';
  end if;
  if not group_is_member(p_gid, p_uid) and not group_is_super(p_gid, p_uid) then
    raise exception '你不是這個群組的成員';
  end if;
  perms := group_permissions(p_gid, p_uid);
  if p_bit <> 0 and perms & p_bit = 0 then
    raise exception '權限不足：需要「%」', group_perm_name(p_bit);
  end if;
  return perms;
end;
$$;

-- 群組階層：能不能管理這個 position 的身分組（擁有者 / 全站管理不受限）
create function public.group_can_manage_position(p_gid uuid, p_uid uuid, p_position int)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select group_is_super(p_gid, p_uid) or p_position < group_top_position(p_gid, p_uid);
$$;

-- 群組階層：能不能管理這位成員（擁有者 / 全站管理不受限；其他人管不到擁有者）
create function public.group_can_manage_member(p_gid uuid, p_uid uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select group_is_super(p_gid, p_uid)
      or (not exists (select 1 from groups where id = p_gid and owner_id = p_target)
          and group_top_position(p_gid, p_target) < group_top_position(p_gid, p_uid));
$$;

-- 群組身分組：依 position 由高到低重新編號為 n..1（@everyone 維持 0）
create function public.group_roles_renumber(p_gid uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update group_roles r
  set position = s.rn
  from (
    select id, (count(*) over ()) - row_number() over (order by position desc, created_at, id) + 1 as rn
    from group_roles where group_id = p_gid and not is_default
  ) s
  where r.id = s.id and r.position <> s.rn;
$$;

-- 群組簡介：{ id, name, description, member_count }
create function public.group_brief(p_gid uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', g.id, 'name', g.name, 'description', g.description,
    'member_count', (select count(*) from group_members m where m.group_id = g.id)
  )
  from groups g where g.id = p_gid;
$$;

-- 群組裡能不能看到其他成員的 email：擁有者 / 全站管理、或有 KICK_MEMBERS / MANAGE_ROLES
create function public.group_sees_emails(p_gid uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select group_is_super(p_gid, p_uid) or group_permissions(p_gid, p_uid) & (32 | 64) <> 0;
$$;

-- ---------- 建立群組與預設群組 ----------

-- 建立群組（含 @everyone 與擁有者成員），回傳群組 id；不檢查權限，給 group_create 與預設群組共用
create function public.group_insert(p_owner uuid, p_name text, p_desc text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
begin
  insert into groups (name, description, owner_id) values (p_name, coalesce(p_desc, ''), p_owner) returning id into gid;
  insert into group_roles (group_id, name, color, position, permissions, is_default)
  values (gid, '@everyone', '', 0, 2, true);
  insert into group_members (group_id, user_id) values (gid, p_owner);
  perform audit(gid, p_owner, 'group.create', 'group', gid::text, jsonb_build_object('name', p_name));
  return gid;
end;
$$;

-- 預設群組的名稱：「<名稱>的群組」，例如「Andy的群組」。
-- 名稱依序取：profiles.name（trim 後非空）→ @ID（profiles.username）→ email 的 @ 前段
-- （profiles.email，沒有就用 auth.users.email）；都沒有就用「我的群組」。
-- 連續空白（含換行）收成一個空格；群組名稱上限 50 字，超過時只截名稱、保留「的群組」（名稱部分最多 47 字）。
create function public.default_group_name(p_uid uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  n text;
begin
  select coalesce(
    nullif(btrim(regexp_replace(coalesce(p.name, ''), '\s+', ' ', 'g')), ''),
    nullif(btrim(coalesce(p.username, '')), ''),
    nullif(btrim(regexp_replace(split_part(btrim(coalesce(nullif(btrim(p.email), ''), u.email, '')), '@', 1), '\s+', ' ', 'g')), '')
  )
  into n
  from profiles p
  left join auth.users u on u.id = p.id
  where p.id = p_uid;

  if n is null then
    return '我的群組';
  end if;
  -- groups.name 上限 50 字：名稱最多 47 字，加上「的群組」
  return rtrim(left(n, 47)) || '的群組';
end;
$$;

-- 使用者的預設群組；沒有（或指到的群組已不是自己的）就建立一個「<名稱>的群組」並設成預設。沒有 profile 時回傳 null。
-- 所有建立預設群組的地方都經過這裡（新 profile 觸發器、ensure_profile、legacy 接回、管理員刪掉別人的預設群組時補建）
create function public.ensure_default_group(p_uid uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
begin
  if p_uid is null then
    return null;
  end if;
  select p.default_group_id into gid from profiles p where p.id = p_uid for update;
  if not found then
    return null;
  end if;
  if gid is not null and exists (select 1 from groups g where g.id = gid and g.owner_id = p_uid) then
    return gid;
  end if;
  gid := group_insert(p_uid, default_group_name(p_uid), '');
  update profiles set default_group_id = gid where id = p_uid;
  return gid;
end;
$$;

-- 使用者目前的預設群組（不建立；沒有或無效時 null）
create function public.default_group_of(p_uid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.default_group_id from profiles p
  join groups g on g.id = p.default_group_id and g.owner_id = p.id
  where p.id = p_uid;
$$;

-- profiles.default_group_id 只能指向自己擁有的群組
create function public.profiles_default_group_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.default_group_id is not null
     and not exists (select 1 from groups g where g.id = new.default_group_id and g.owner_id = new.id) then
    raise exception '只能把自己擁有的群組設為預設';
  end if;
  return new;
end;
$$;

create trigger profiles_default_group_guard
  before insert or update of default_group_id on public.profiles
  for each row execute function public.profiles_default_group_guard();

-- 新 profile 自動建立預設群組（handle_new_user、ensure_profile 都會 insert profile）
create function public.profiles_create_default_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform ensure_default_group(new.id);
  return null;
end;
$$;

create trigger profiles_create_default_group
  after insert on public.profiles
  for each row execute function public.profiles_create_default_group();

-- 群組換擁有者時，不能是原擁有者的預設群組（group_transfer 會先把預設改走）
create function public.groups_owner_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is distinct from old.owner_id
     and exists (select 1 from profiles p where p.id = old.owner_id and p.default_group_id = old.id) then
    raise exception '這是擁有者的預設群組，請先把其他群組設為預設再轉移';
  end if;
  return new;
end;
$$;

create trigger groups_owner_guard
  before update of owner_id on public.groups
  for each row execute function public.groups_owner_guard();

-- 刪除 profile（刪帳號）前，先刪掉只有自己一個成員的群組（groups.owner_id 沒有 cascade）。
-- 還有其他成員的群組不動：can_delete_self / admin_can_delete_user 會先擋，漏網時由 FK 擋下整筆刪除。
-- 接著撤銷他建立的邀請連結（保留那一列）、刪除他送出與寄給他的 Email / @ID 邀請，
-- 各記一筆 group.invite.revoke（操作者 null = 系統、detail.reason = 'account_deleted'）；操作紀錄與託管密文都保留，
-- 託管密文記下 account_deleted_at（prune_retention 在一年後才刪）
create function public.profiles_delete_owned_groups()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  emails text[];
begin
  delete from groups g
  where g.owner_id = old.id
    and not exists (select 1 from group_members m where m.group_id = g.id and m.user_id <> old.id);

  -- 他建立的邀請連結：撤銷（保留那一列，created_by 由 FK 改成 null）
  with revoked as (
    update group_invites i set revoked_at = now()
    where i.created_by = old.id and i.revoked_at is null
    returning i.group_id, i.code
  )
  insert into audit_logs (group_id, actor_id, action, target_type, target_id, detail)
  select x.group_id, null, 'group.invite.revoke', 'invite', x.code,
         jsonb_build_object('name', x.code, 'reason', 'account_deleted')
  from revoked x;

  -- 他送出的、寄給他的 Email / @ID 邀請：刪除
  emails := array_remove(array[
    user_email(old.id),
    lower(old.email),
    (select lower(u.email) from auth.users u where u.id = old.id)
  ], null);
  with removed as (
    delete from group_email_invites e
    where e.invited_by = old.id or e.email = any (emails)
    returning e.group_id, e.id, e.email
  )
  insert into audit_logs (group_id, actor_id, action, target_type, target_id, detail)
  select x.group_id, null, 'group.invite.revoke', 'invite', x.id::text,
         jsonb_build_object('name', x.email, 'email', x.email, 'reason', 'account_deleted')
  from removed x;

  -- 託管密文保留：記下帳號刪除的時間，prune_retention 在一年後才刪
  update vault_escrow v set account_deleted_at = now()
  where v.user_id = old.id and v.account_deleted_at is null;

  return old;
end;
$$;

create trigger profiles_delete_owned_groups
  before delete on public.profiles
  for each row execute function public.profiles_delete_owned_groups();

-- 新加入的群組（建立群組、邀請連結加入、接受邀請、補建預設群組）排在自己清單的最後：
-- position = 自己目前最大值 + 1；新使用者的第一個群組（預設群組）自然是 0
create function public.group_members_set_position()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(max(m.position), -1) + 1 into new.position
  from group_members m
  where m.user_id = new.user_id;
  return new;
end;
$$;

create trigger group_members_set_position
  before insert on public.group_members
  for each row execute function public.group_members_set_position();

-- ---------- 群組 RPC ----------

-- 建立群組（全站 CREATE_GROUPS）：同時建立 @everyone（VIEW_CODES）並把自己加成成員；回傳群組 id
create function public.group_create(name text, description text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_name text := trim(coalesce(group_create.name, ''));
  p_desc text := trim(coalesce(group_create.description, ''));
begin
  perform site_require(uid, 256);
  if p_name = '' then
    raise exception '請輸入群組名稱';
  end if;
  if char_length(p_name) > 50 then
    raise exception '群組名稱最多 50 個字';
  end if;
  if char_length(p_desc) > 300 then
    raise exception '群組說明最多 300 個字';
  end if;
  return group_insert(uid, p_name, p_desc);
end;
$$;

-- 我所在的群組：[{ id, name, description, owner_id, is_owner, is_default, encrypted, position,
--   member_count, account_count, permissions }]；依我自己排的 position，再依預設群組、加入時間、建立時間排序
create function public.my_groups()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  def uuid := default_group_of(uid);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', g.id, 'name', g.name, 'description', g.description, 'owner_id', g.owner_id,
      'owner', user_brief(g.owner_id, false),
      -- 擁有者以外的成員，依身分組位置由高到低（同位置先加入的在前）取前 3 位，App 在擁有者頭像右下角顯示
      'members_preview', (
        select coalesce(jsonb_agg(user_brief(x.user_id, false) order by x.top desc, x.joined_at), '[]'::jsonb)
        from (
          select gm.user_id, gm.joined_at, group_top_position(g.id, gm.user_id) as top
          from group_members gm
          where gm.group_id = g.id and gm.user_id <> g.owner_id
          order by top desc, gm.joined_at
          limit 3
        ) x
      ),
      'is_owner', g.owner_id = uid,
      'is_default', g.id = def,
      'encrypted', g.encrypted,
      'position', m.position,
      'member_count', (select count(*) from group_members x where x.group_id = g.id),
      'account_count', (select count(*) from totp_accounts a where a.group_id = g.id and account_permissions(a.id, uid) & 2 <> 0),
      'permissions', group_permissions(g.id, uid)
    ) order by m.position, (g.id = def) desc nulls last, m.joined_at, g.created_at)
    from group_members m join groups g on g.id = m.group_id
    where m.user_id = uid
  ), '[]'::jsonb);
end;
$$;

-- 調整我的群組順序：ids 必須剛好是自己所在的全部群組（由上到下，不多不少、不重複），照順序寫成 position 0..n-1
create function public.my_groups_reorder(ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_ids uuid[] := coalesce(my_groups_reorder.ids, '{}');
  n int;
begin
  -- 鎖住自己的成員列：和同時加入 / 離開群組互斥
  perform 1 from group_members m where m.user_id = uid for update;

  if exists (select 1 from unnest(p_ids) x where x is null)
     or (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids) then
    raise exception '群組順序有重複或空白的項目，請重新整理後再試';
  end if;
  if exists (select 1 from unnest(p_ids) x
             where not exists (select 1 from group_members m where m.group_id = x and m.user_id = uid)) then
    raise exception '只能排序自己所在的群組';
  end if;
  select count(*) into n from group_members m where m.user_id = uid;
  if cardinality(p_ids) <> n then
    raise exception '群組清單已變更，請重新整理後再試';
  end if;

  update group_members m set position = x.ord - 1
  from unnest(p_ids) with ordinality as x(id, ord)
  where m.group_id = x.id and m.user_id = uid and m.position <> x.ord - 1;
end;
$$;

-- 群組內頁資料（成員或全站 MANAGE_GROUPS）：group（含 encrypted）/ is_owner / is_default（是不是我的預設群組）/
-- owned_count（我擁有幾個群組）/ permissions / top_position / roles / members / invites / email_invites /
-- category_order（群組自訂的類別順序）。
-- 成員 / 邀請建立者的 email 只給管得到成員的人（group_sees_emails）
create function public.group_detail(gid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_detail.gid;
  perms bigint := group_require(p_gid, uid, 0);
  show_invites boolean := perms & (16 | 128) <> 0;
  with_email boolean := group_sees_emails(p_gid, uid);
  owner uuid;
begin
  select owner_id into owner from groups where id = p_gid;
  return jsonb_build_object(
    'group', (select jsonb_build_object('id', g.id, 'name', g.name, 'description', g.description,
                                        'owner_id', g.owner_id, 'created_at', g.created_at, 'encrypted', g.encrypted)
              from groups g where g.id = p_gid),
    'is_owner', owner = uid,
    'is_default', default_group_of(uid) is not distinct from p_gid,
    'owned_count', (select count(*) from groups g where g.owner_id = uid),
    'permissions', perms,
    'top_position', group_top_position(p_gid, uid),
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name, 'color', r.color, 'position', r.position, 'permissions', r.permissions,
        'is_default', r.is_default,
        'member_count', case when r.is_default then (select count(*) from group_members m where m.group_id = p_gid)
                             else (select count(*) from group_member_roles mr where mr.role_id = r.id) end
      ) order by r.is_default, r.position desc, r.created_at)
      from group_roles r where r.group_id = p_gid
    ), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(
        user_brief(m.user_id, with_email) || jsonb_build_object(
          'role_ids', coalesce((
            select jsonb_agg(mr.role_id order by r.position desc)
            from group_member_roles mr join group_roles r on r.id = mr.role_id
            where mr.group_id = p_gid and mr.user_id = m.user_id and not r.is_default
          ), '[]'::jsonb),
          'joined_at', m.joined_at,
          'is_owner', m.user_id = owner,
          'top_position', group_top_position(p_gid, m.user_id)
        ) order by (m.user_id = owner) desc, group_top_position(p_gid, m.user_id) desc, m.joined_at)
      from group_members m where m.group_id = p_gid
    ), '[]'::jsonb),
    'invites', case when show_invites then coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', i.code, 'created_by', user_brief(i.created_by, with_email), 'created_at', i.created_at,
        'expires_at', i.expires_at, 'max_uses', i.max_uses, 'uses', i.uses
      ) order by i.created_at desc)
      from group_invites i where i.group_id = p_gid and invite_invalid_reason(i) is null
    ), '[]'::jsonb) else '[]'::jsonb end,
    'email_invites', case when show_invites then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'email', e.email, 'invited_by', user_brief(e.invited_by, with_email), 'created_at', e.created_at
      ) order by e.created_at desc)
      from group_email_invites e where e.group_id = p_gid
    ), '[]'::jsonb) else '[]'::jsonb end,
    'category_order', to_jsonb((select g.category_order from groups g where g.id = p_gid))
  );
end;
$$;

-- 修改群組名稱與說明（MANAGE_GROUP）；null 代表不改
create function public.group_update(gid uuid, name text, description text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_update.gid;
  p_name text := trim(group_update.name);
  p_desc text := trim(group_update.description);
  old groups%rowtype;
begin
  perform group_require(p_gid, uid, 128);
  if p_name is not null and p_name = '' then
    raise exception '請輸入群組名稱';
  end if;
  if char_length(p_name) > 50 then
    raise exception '群組名稱最多 50 個字';
  end if;
  if char_length(p_desc) > 300 then
    raise exception '群組說明最多 300 個字';
  end if;

  select * into old from groups where id = p_gid;
  update groups g
  set name = coalesce(p_name, g.name), description = coalesce(p_desc, g.description)
  where g.id = p_gid;

  perform audit(p_gid, uid, 'group.update', 'group', p_gid::text, jsonb_build_object(
    'name', coalesce(p_name, old.name), 'old_name', old.name,
    'description_changed', p_desc is not null and p_desc <> old.description));
end;
$$;

-- 刪除群組（擁有者、全站 ADMINISTRATOR）：擁有者不能刪自己的預設群組、也不能刪唯一擁有的群組；
-- 管理員刪掉別人的預設群組時，幫擁有者把預設改到他擁有的另一個群組（沒有就建立新的預設群組）。
-- 群組紀錄會跟著刪除，所以記在全站紀錄
create function public.group_delete(gid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_delete.gid;
  g groups%rowtype;
  members uuid[];
begin
  select * into g from groups where id = p_gid;
  if g.id is null then
    raise exception '找不到這個群組';
  end if;
  if g.owner_id <> uid and site_permissions(uid) & 1 = 0 then
    raise exception '只有群組擁有者可以刪除群組';
  end if;
  if g.owner_id = uid then
    if default_group_of(uid) = p_gid then
      raise exception '這是你的預設群組，請先把其他群組設為預設再刪除';
    end if;
    if (select count(*) from groups x where x.owner_id = uid) <= 1 then
      raise exception '你至少要擁有一個群組，不能刪除唯一的群組';
    end if;
  end if;

  members := array(select m.user_id from group_members m where m.group_id = p_gid);
  delete from groups where id = p_gid;

  if exists (select 1 from profiles p where p.id = g.owner_id and p.default_group_id = p_gid) then
    update profiles p
    set default_group_id = (select x.id from groups x where x.owner_id = g.owner_id order by x.created_at, x.id limit 1)
    where p.id = g.owner_id;
    perform ensure_default_group(g.owner_id);
  end if;

  perform audit(null, uid, 'group.delete', 'group', p_gid::text, jsonb_build_object('name', g.name, 'owner_id', g.owner_id));
  -- 通知其他成員（刪除者除外）
  perform notify(members, 'group_deleted', '群組已刪除', format('%s 刪除了群組「%s」。', notify_name(uid), g.name), null,
                 jsonb_build_object('group_id', p_gid, 'actor_id', uid));
end;
$$;

-- 轉移擁有權（只有擁有者）；新擁有者必須是成員，加密的群組不能轉移。轉移的是自己的預設群組時，
-- 預設自動改到自己擁有的另一個群組（最早建立的），沒有就擋；新擁有者的預設不受影響
create function public.group_transfer(gid uuid, new_owner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_transfer.gid;
  p_new uuid := group_transfer.new_owner;
  alt uuid;
begin
  if not exists (select 1 from groups where id = p_gid) then
    raise exception '找不到這個群組';
  end if;
  if not exists (select 1 from groups where id = p_gid and owner_id = uid) then
    raise exception '只有群組擁有者可以轉移擁有權';
  end if;
  if p_new is null or p_new = uid then
    raise exception '請選擇其他成員';
  end if;
  if not group_is_member(p_gid, p_new) then
    raise exception '新擁有者必須是群組成員';
  end if;
  if exists (select 1 from groups where id = p_gid and encrypted) then
    raise exception '加密的群組不能轉移擁有權，請先關閉加密';
  end if;

  if exists (select 1 from profiles p where p.id = uid and p.default_group_id = p_gid) then
    select x.id into alt from groups x where x.owner_id = uid and x.id <> p_gid order by x.created_at, x.id limit 1;
    if alt is null then
      raise exception '這是你唯一擁有的群組，請先建立另一個群組再轉移';
    end if;
    update profiles set default_group_id = alt where id = uid;
  end if;

  update groups set owner_id = p_new where id = p_gid;
  perform audit(p_gid, uid, 'group.transfer', 'member', p_new::text,
                jsonb_build_object('name', display_name(p_new), 'group_name', (select name from groups where id = p_gid),
                                   'from', uid, 'to', p_new));
  perform notify(array[p_new], 'ownership_received', '你成為群組擁有者',
                 format('%s 把「%s」的擁有權轉移給你。', notify_name(uid), (select name from groups where id = p_gid)),
                 '/groups/' || p_gid::text, jsonb_build_object('group_id', p_gid, 'actor_id', uid));
end;
$$;

-- 把自己擁有的群組設成預設
create function public.group_set_default(gid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_set_default.gid;
begin
  if not exists (select 1 from groups g where g.id = p_gid and g.owner_id = uid) then
    raise exception '只能把自己擁有的群組設為預設';
  end if;
  update profiles set default_group_id = p_gid where id = uid;
end;
$$;

-- ---------- 成員與身分組 ----------

-- 離開群組（擁有者不能離開，要先轉移或刪除）；同時撤銷他建立的邀請連結、刪除他送出的 Email 邀請
create function public.group_leave(gid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_leave.gid;
begin
  if not group_is_member(p_gid, uid) then
    raise exception '你不是這個群組的成員';
  end if;
  if exists (select 1 from groups where id = p_gid and owner_id = uid) then
    raise exception '擁有者不能離開群組，請先轉移擁有權或刪除群組';
  end if;
  delete from group_account_overwrites o
  using totp_accounts a
  where a.id = o.account_id and a.group_id = p_gid and o.target_type = 'member' and o.target_id = uid;
  update group_invites i set revoked_at = coalesce(i.revoked_at, now()) where i.group_id = p_gid and i.created_by = uid;
  delete from group_email_invites e where e.group_id = p_gid and e.invited_by = uid;
  delete from group_members where group_id = p_gid and user_id = uid;
  perform audit(p_gid, uid, 'group.member.leave', 'member', uid::text, jsonb_build_object('name', display_name(uid)));
end;
$$;

-- 移除成員（KICK_MEMBERS + 階層；任何人都不能踢擁有者）；同時撤銷他建立的邀請連結、刪除他送出的 Email 邀請
create function public.group_kick(gid uuid, user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_kick.gid;
  p_target uuid := group_kick.user_id;
begin
  perform group_require(p_gid, uid, 32);
  if not group_is_member(p_gid, p_target) then
    raise exception '對方不是這個群組的成員';
  end if;
  if exists (select 1 from groups g where g.id = p_gid and g.owner_id = p_target) then
    raise exception '不能移除群組擁有者';
  end if;
  if p_target = uid then
    raise exception '不能移除自己，請改用「離開群組」';
  end if;
  if not group_can_manage_member(p_gid, uid, p_target) then
    raise exception '只能管理比你目前最高身分組還低的身分組 / 成員';
  end if;
  delete from group_account_overwrites o
  using totp_accounts a
  where a.id = o.account_id and a.group_id = p_gid and o.target_type = 'member' and o.target_id = p_target;
  update group_invites i set revoked_at = coalesce(i.revoked_at, now()) where i.group_id = p_gid and i.created_by = p_target;
  delete from group_email_invites e where e.group_id = p_gid and e.invited_by = p_target;
  delete from group_members m where m.group_id = p_gid and m.user_id = p_target;
  perform audit(p_gid, uid, 'group.member.kick', 'member', p_target::text, jsonb_build_object('name', display_name(p_target)));
  perform notify(array[p_target], 'member_removed', '已被移出群組',
                 format('你已被移出「%s」。', (select name from groups where id = p_gid)), null,
                 jsonb_build_object('group_id', p_gid, 'actor_id', uid));
end;
$$;

-- ---------- 封鎖名單（BAN_MEMBERS）----------

-- 這位使用者是否被這個群組封鎖
create function public.group_is_banned(p_gid uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from group_bans b where b.group_id = p_gid and b.user_id = p_uid);
$$;

-- 用 email、@ID（可帶 @）或使用者 UUID 找使用者（規則與錯誤訊息同 group_add_member）；找不到就 raise
create function public.group_find_user(p_target text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t text := trim(coalesce(p_target, ''));
  target_uid uuid;
  e text;
begin
  if t = '' then
    raise exception '請輸入電子郵件、@ID 或使用者 ID';
  end if;

  -- 使用者 UUID（有沒有連字號都可以）；找不到時再當 @ID 找（舊的 @ID 可能剛好是 32 位十六進位）
  if t !~ '^@' and replace(lower(t), '-', '') ~ '^[0-9a-f]{32}$' then
    select p.id into target_uid from profiles p where p.id = replace(lower(t), '-', '')::uuid;
    if target_uid is null then
      select p.id into target_uid from profiles p where p.username = username_normalize(t);
    end if;
    if target_uid is null then
      raise exception '找不到這位使用者';
    end if;
  elsif t like '@%' or position('@' in t) = 0 then
    select p.id into target_uid from profiles p where p.username = username_normalize(t);
    if target_uid is null then
      raise exception '找不到這個 @ID';
    end if;
  else
    e := lower(t);
    if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'Email 格式不正確';
    end if;
    -- 已驗證的 auth.users 優先；沒有 auth.users 那列的 profile 才用 profiles.email（同 user_email）
    select p.id into target_uid
    from auth.users u join profiles p on p.id = u.id
    where lower(u.email) = e
    order by (u.email_confirmed_at is not null) desc, u.created_at
    limit 1;
    if target_uid is null then
      select p.id into target_uid
      from profiles p
      where lower(p.email) = e and not exists (select 1 from auth.users u where u.id = p.id)
      order by p.id
      limit 1;
    end if;
    if target_uid is null then
      raise exception '找不到使用這個電子郵件的使用者';
    end if;
  end if;
  return target_uid;
end;
$$;

-- 封鎖名單（BAN_MEMBERS），新到舊：[{ user_id, name, username, photo_url, email, reason, created_at, updated_at,
--   banned_by: { id, name } | null }]；email 只給看得到成員 email 的人（group_sees_emails），否則 null
create function public.group_bans(gid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_bans.gid;
  with_email boolean;
begin
  perform group_require(p_gid, uid, 512);
  with_email := group_sees_emails(p_gid, uid);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', b.user_id,
      'name', p.name,
      'username', p.username,
      'photo_url', p.photo_url,
      'email', case when with_email then coalesce(u.email, p.email) end,
      'reason', b.reason,
      'created_at', b.created_at,
      'updated_at', b.updated_at,
      'banned_by', case when b.banned_by is not null then jsonb_build_object(
        'id', b.banned_by,
        'name', case when with_email then display_name(b.banned_by)
                     else (select coalesce(nullif(x.name, ''), x.username) from profiles x where x.id = b.banned_by) end
      ) end
    ) order by b.created_at desc, b.user_id)
    from group_bans b
    join profiles p on p.id = b.user_id
    left join auth.users u on u.id = b.user_id
    where b.group_id = p_gid
  ), '[]'::jsonb);
end;
$$;

-- 封鎖使用者（BAN_MEMBERS）：target 同 group_add_member（email、@ID 或使用者 UUID）；reason 最多 200 字。
-- 不能封鎖自己、擁有者；已經封鎖過就 raise。對方是成員時階層同 group_kick，並照 group_kick 的方式移出群組
-- （刪掉他的成員覆寫、撤銷他建立的邀請連結、刪除他送出的 Email 邀請，不另外記 group.member.kick）；
-- 另外刪除寄給他的 Email / @ID 邀請。加密的群組也可以封鎖。記 group.member.ban（target_type 'user'）
create function public.group_ban(gid uuid, target text, reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_ban.gid;
  p_reason text := trim(coalesce(group_ban.reason, ''));
  target_uid uuid;
  was_member boolean;
begin
  perform group_require(p_gid, uid, 512);
  if char_length(p_reason) > 200 then
    raise exception '封鎖原因最多 200 個字';
  end if;
  target_uid := group_find_user(group_ban.target);
  if target_uid = uid then
    raise exception '不能封鎖自己';
  end if;
  if exists (select 1 from groups g where g.id = p_gid and g.owner_id = target_uid) then
    raise exception '不能封鎖群組擁有者';
  end if;

  -- 鎖住群組列：和同時進行的加入（group_join、respond_invitation、group_add_member 都會共享鎖群組列）互斥
  perform 1 from groups g where g.id = p_gid for update;
  if group_is_banned(p_gid, target_uid) then
    raise exception '這位使用者已經被封鎖';
  end if;

  -- 是成員：階層同移除成員，照 group_kick 的方式移出（不另外記 group.member.kick）
  was_member := group_is_member(p_gid, target_uid);
  if was_member then
    if not group_can_manage_member(p_gid, uid, target_uid) then
      raise exception '只能封鎖身分組比你低的成員';
    end if;
    delete from group_account_overwrites o
    using totp_accounts a
    where a.id = o.account_id and a.group_id = p_gid and o.target_type = 'member' and o.target_id = target_uid;
    update group_invites i set revoked_at = coalesce(i.revoked_at, now()) where i.group_id = p_gid and i.created_by = target_uid;
    delete from group_email_invites e where e.group_id = p_gid and e.invited_by = target_uid;
    delete from group_members m where m.group_id = p_gid and m.user_id = target_uid;
  end if;

  -- 寄給他的 Email / @ID 邀請（已驗證的 email、auth.users 與 profiles 上的 email 都算）
  delete from group_email_invites e
  where e.group_id = p_gid
    and e.email = any (array[
      user_email(target_uid),
      (select lower(u.email) from auth.users u where u.id = target_uid),
      (select lower(p.email) from profiles p where p.id = target_uid)
    ]);

  insert into group_bans (group_id, user_id, reason, banned_by)
  values (p_gid, target_uid, p_reason, uid);

  perform audit(p_gid, uid, 'group.member.ban', 'user', target_uid::text,
                jsonb_build_object('name', display_name(target_uid), 'reason', p_reason, 'was_member', was_member));
  -- 通知被封鎖的人（不含原因）
  perform notify(array[target_uid], 'member_banned', '已被群組封鎖',
                 format('你已被「%s」封鎖，無法再加入這個群組。', (select name from groups where id = p_gid)), null,
                 jsonb_build_object('group_id', p_gid, 'actor_id', uid));
end;
$$;

-- 修改封鎖原因（BAN_MEMBERS）；沒有變就不記紀錄。記 group.member.ban.update（detail 帶 reason、old_reason）
create function public.group_ban_update(gid uuid, user_id uuid, reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_ban_update.gid;
  p_target uuid := group_ban_update.user_id;
  p_reason text := trim(coalesce(group_ban_update.reason, ''));
  old_reason text;
begin
  perform group_require(p_gid, uid, 512);
  if char_length(p_reason) > 200 then
    raise exception '封鎖原因最多 200 個字';
  end if;
  select b.reason into old_reason from group_bans b where b.group_id = p_gid and b.user_id = p_target for update;
  if not found then
    raise exception '這位使用者沒有被封鎖';
  end if;
  if old_reason = p_reason then
    return;
  end if;
  update group_bans b set reason = p_reason, updated_at = now() where b.group_id = p_gid and b.user_id = p_target;
  perform audit(p_gid, uid, 'group.member.ban.update', 'user', p_target::text,
                jsonb_build_object('name', display_name(p_target), 'reason', p_reason, 'old_reason', old_reason));
end;
$$;

-- 解除封鎖（BAN_MEMBERS）：之後可以再被邀請、用邀請連結加入。記 group.member.unban
create function public.group_unban(gid uuid, user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_unban.gid;
  p_target uuid := group_unban.user_id;
  old_reason text;
begin
  perform group_require(p_gid, uid, 512);
  delete from group_bans b where b.group_id = p_gid and b.user_id = p_target returning b.reason into old_reason;
  if not found then
    raise exception '這位使用者沒有被封鎖';
  end if;
  perform audit(p_gid, uid, 'group.member.unban', 'user', p_target::text,
                jsonb_build_object('name', display_name(p_target), 'reason', old_reason));
end;
$$;

-- 全站管理員直接把使用者加進群組（全站 MANAGE_GROUPS / ADMINISTRATOR），不用邀請；回傳 { id, name }（name 是加入者的顯示名稱）。
-- 群組內的管理者（含擁有者）沒有全站權限的不行，他們繼續用邀請連結 / Email 邀請。
-- target 可以是 email、@ID（可帶 @）或使用者 UUID。
-- 擋：找不到使用者、已經是成員、被這個群組封鎖、加密的群組、對方 email 未驗證（只認已驗證的，同 user_email）。
-- 加入後只有 @everyone 的權限；刪掉這位使用者在此群組待處理的 Email 邀請；
-- 寫一筆群組操作紀錄 group.member.add（detail 帶 name = 加入者、actor_name = 操作者）
create function public.group_add_member(gid uuid, target text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_add_member.gid;
  t text := trim(coalesce(group_add_member.target, ''));
  g groups%rowtype;
  target_uid uuid;
  via text;
  e text;
  added int;
begin
  perform site_require(uid, 512);

  -- 共享鎖：和 group_set_encrypted 互斥（開啟加密時會檢查成員）
  select * into g from groups x where x.id = p_gid for share;
  if g.id is null then
    raise exception '找不到這個群組';
  end if;
  if g.encrypted then
    raise exception '加密的群組不能加入其他成員';
  end if;
  if t = '' then
    raise exception '請輸入電子郵件、@ID 或使用者 ID';
  end if;

  -- 使用者 UUID（有沒有連字號都可以）；找不到時再當 @ID 找（舊的 @ID 可能剛好是 32 位十六進位）
  if t !~ '^@' and replace(lower(t), '-', '') ~ '^[0-9a-f]{32}$' then
    via := 'id';
    select p.id into target_uid from profiles p where p.id = replace(lower(t), '-', '')::uuid;
    if target_uid is null then
      via := 'username';
      select p.id into target_uid from profiles p where p.username = username_normalize(t);
    end if;
    if target_uid is null then
      raise exception '找不到這位使用者';
    end if;
  elsif t like '@%' or position('@' in t) = 0 then
    via := 'username';
    select p.id into target_uid from profiles p where p.username = username_normalize(t);
    if target_uid is null then
      raise exception '找不到這個 @ID';
    end if;
  else
    via := 'email';
    e := lower(t);
    if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'Email 格式不正確';
    end if;
    -- 已驗證的 auth.users 優先；沒有 auth.users 那列的 profile 才用 profiles.email（同 user_email）
    select p.id into target_uid
    from auth.users u join profiles p on p.id = u.id
    where lower(u.email) = e
    order by (u.email_confirmed_at is not null) desc, u.created_at
    limit 1;
    if target_uid is null then
      select p.id into target_uid
      from profiles p
      where lower(p.email) = e and not exists (select 1 from auth.users u where u.id = p.id)
      order by p.id
      limit 1;
    end if;
    if target_uid is null then
      raise exception '找不到使用這個電子郵件的使用者';
    end if;
  end if;

  if group_is_member(p_gid, target_uid) then
    raise exception '% 已經是群組成員', coalesce(display_name(target_uid), '對方');
  end if;
  if group_is_banned(p_gid, target_uid) then
    raise exception '這位使用者已被這個群組封鎖';
  end if;

  -- 只認已驗證的 email：未驗證的帳號可能是別人冒用 email 註冊的
  e := user_email(target_uid);
  if e is null then
    raise exception '對方的電子郵件還沒驗證，不能加入群組';
  end if;

  -- 只加成員、不給身分組（只有 @everyone）；position 由 group_members_set_position 觸發器排最後
  insert into group_members (group_id, user_id) values (p_gid, target_uid) on conflict do nothing;
  get diagnostics added = row_count;
  if added = 0 then
    raise exception '% 已經是群組成員', coalesce(display_name(target_uid), '對方');
  end if;

  delete from group_email_invites x where x.group_id = p_gid and x.email = e;

  perform audit(p_gid, uid, 'group.member.add', 'member', target_uid::text,
                jsonb_build_object('name', display_name(target_uid), 'actor_name', display_name(uid), 'via', via));
  perform notify(array[target_uid], 'member_added', '已加入群組', format('%s 把你加入了「%s」。', notify_name(uid), g.name),
                 '/groups/' || p_gid::text, jsonb_build_object('group_id', p_gid, 'actor_id', uid));

  return jsonb_build_object('id', target_uid, 'name', display_name(target_uid));
end;
$$;

-- 指派成員身分組（MANAGE_ROLES + 階層）：只改呼叫者管得到的身分組，管不到的維持原樣；加入管不到的就 raise；
-- 新加入的身分組權限不能超過自己（擁有者 / 全站管理例外）
create function public.group_set_member_roles(gid uuid, user_id uuid, role_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_set_member_roles.gid;
  p_target uuid := group_set_member_roles.user_id;
  p_roles uuid[] := coalesce(group_set_member_roles.role_ids, '{}');
  mine bigint;
  top int;
  is_super boolean;
  added uuid[];
  removed uuid[];
begin
  mine := group_require(p_gid, uid, 64);
  if not group_is_member(p_gid, p_target) then
    raise exception '對方不是這個群組的成員';
  end if;
  if not group_can_manage_member(p_gid, uid, p_target) then
    raise exception '只能管理比你目前最高身分組還低的身分組 / 成員';
  end if;
  if exists (
    select 1 from unnest(p_roles) as x(id)
    where not exists (select 1 from group_roles r where r.id = x.id and r.group_id = p_gid and not r.is_default)
  ) then
    raise exception '找不到指定的身分組';
  end if;

  is_super := group_is_super(p_gid, uid);
  top := group_top_position(p_gid, uid);

  -- 要新加入的身分組都必須管得到，而且權限是自己權限的子集（group_permissions 已把 ADMINISTRATOR 展開成全部）
  select array_agg(r.id) into added
  from group_roles r
  where r.id = any (p_roles)
    and not exists (select 1 from group_member_roles mr where mr.group_id = p_gid and mr.user_id = p_target and mr.role_id = r.id);
  if exists (select 1 from group_roles r where r.id = any (coalesce(added, '{}')) and not is_super and r.position >= top) then
    raise exception '只能管理比你目前最高身分組還低的身分組 / 成員';
  end if;
  if exists (select 1 from group_roles r where r.id = any (coalesce(added, '{}')) and not is_super and r.permissions & 1023 & ~mine <> 0) then
    raise exception '只能指派權限不超過你自己的身分組';
  end if;

  -- 要移除的：目前有、不在清單裡、而且管得到
  select array_agg(mr.role_id) into removed
  from group_member_roles mr join group_roles r on r.id = mr.role_id
  where mr.group_id = p_gid and mr.user_id = p_target
    and not (mr.role_id = any (p_roles))
    and (is_super or r.position < top);

  delete from group_member_roles mr
  where mr.group_id = p_gid and mr.user_id = p_target and mr.role_id = any (coalesce(removed, '{}'));
  insert into group_member_roles (group_id, user_id, role_id)
  select p_gid, p_target, x from unnest(coalesce(added, '{}')) as x
  on conflict do nothing;

  if coalesce(array_length(added, 1), 0) + coalesce(array_length(removed, 1), 0) > 0 then
    perform audit(p_gid, uid, 'group.member.roles', 'member', p_target::text,
                  jsonb_build_object('name', display_name(p_target), 'added', coalesce(added, '{}'), 'removed', coalesce(removed, '{}')));
    perform notify(array[p_target], 'group_roles_changed', '群組身分組已變更',
                   format('%s 變更了你在「%s」的身分組。', notify_name(uid), (select name from groups where id = p_gid)),
                   '/groups/' || p_gid::text,
                   jsonb_build_object('group_id', p_gid, 'actor_id', uid, 'added', coalesce(added, '{}'), 'removed', coalesce(removed, '{}')));
  end if;
end;
$$;

-- 建立群組身分組（MANAGE_ROLES；只能開自己有的位元）：position = 1，其他 ≥ 1 的全部 +1；回傳 id
create function public.group_role_create(gid uuid, name text, color text, permissions bigint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_role_create.gid;
  p_name text := norm_role_name(group_role_create.name);
  p_color text := norm_color(group_role_create.color);
  p_perms bigint := coalesce(group_role_create.permissions, 0) & 1023;
  mine bigint;
  rid uuid;
begin
  mine := group_require(p_gid, uid, 64);
  if p_perms & ~mine <> 0 then
    raise exception '只能開啟你自己擁有的權限';
  end if;
  update group_roles r set position = r.position + 1
  where r.group_id = p_gid and not r.is_default and r.position >= 1;
  insert into group_roles (group_id, name, color, position, permissions)
  values (p_gid, p_name, p_color, 1, p_perms) returning id into rid;
  perform audit(p_gid, uid, 'group.role.create', 'role', rid::text,
                jsonb_build_object('name', p_name, 'color', p_color, 'permissions', p_perms));
  return rid;
end;
$$;

-- 編輯群組身分組（MANAGE_ROLES + 階層 + 只能開自己有的位元）；@everyone 只能改 permissions；null 代表不改
create function public.group_role_update(role_id uuid, name text, color text, permissions bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  r group_roles%rowtype;
  p_name text;
  p_color text;
  p_perms bigint;
  mine bigint;
begin
  select * into r from group_roles where id = group_role_update.role_id;
  if r.id is null then
    raise exception '找不到這個身分組';
  end if;
  mine := group_require(r.group_id, uid, 64);
  if not r.is_default and not group_can_manage_position(r.group_id, uid, r.position) then
    raise exception '只能管理比你目前最高身分組還低的身分組 / 成員';
  end if;

  p_perms := coalesce(group_role_update.permissions, r.permissions) & 1023;
  if p_perms & ~r.permissions & ~mine <> 0 then
    raise exception '只能開啟你自己擁有的權限';
  end if;
  if r.is_default then
    p_name := r.name;
    p_color := r.color;
  else
    p_name := case when group_role_update.name is null then r.name else norm_role_name(group_role_update.name) end;
    p_color := case when group_role_update.color is null then r.color else norm_color(group_role_update.color) end;
  end if;

  update group_roles x set name = p_name, color = p_color, permissions = p_perms where x.id = r.id;
  perform audit(r.group_id, uid, 'group.role.update', 'role', r.id::text, jsonb_build_object(
    'name', p_name, 'color', p_color, 'permissions', p_perms, 'old_permissions', r.permissions));
end;
$$;

-- 刪除群組身分組（MANAGE_ROLES + 階層）；@everyone 不能刪
create function public.group_role_delete(role_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  r group_roles%rowtype;
  holders uuid[];
begin
  select * into r from group_roles where id = group_role_delete.role_id;
  if r.id is null then
    raise exception '找不到這個身分組';
  end if;
  perform group_require(r.group_id, uid, 64);
  if r.is_default then
    raise exception '@everyone 不能刪除';
  end if;
  if not group_can_manage_position(r.group_id, uid, r.position) then
    raise exception '只能管理比你目前最高身分組還低的身分組 / 成員';
  end if;
  holders := array(select mr.user_id from group_member_roles mr where mr.role_id = r.id);
  delete from group_account_overwrites o where o.target_type = 'role' and o.target_id = r.id;
  delete from group_roles x where x.id = r.id;
  perform group_roles_renumber(r.group_id);
  perform audit(r.group_id, uid, 'group.role.delete', 'role', r.id::text, jsonb_build_object('name', r.name));
  -- 持有這個身分組的成員：身分組變了
  perform notify(holders, 'group_roles_changed', '群組身分組已變更',
                 format('%s 刪除了「%s」的身分組「%s」。', notify_name(uid), (select name from groups where id = r.group_id), r.name),
                 '/groups/' || r.group_id::text,
                 jsonb_build_object('group_id', r.group_id, 'actor_id', uid, 'role_id', r.id, 'role_name', r.name, 'deleted', true));
end;
$$;

-- 群組身分組排序（MANAGE_ROLES）：role_ids = 由高到低的完整順序（不含 @everyone）；
-- 管不到的身分組排名不能變；依新順序重新編號為 n..1
create function public.group_roles_reorder(gid uuid, role_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_roles_reorder.gid;
  p_ids uuid[] := coalesce(group_roles_reorder.role_ids, '{}');
  n int;
  is_super boolean;
  top int;
begin
  perform group_require(p_gid, uid, 64);
  select count(*) into n from group_roles where group_id = p_gid and not is_default;
  if cardinality(p_ids) <> n
     or (select count(distinct x) from unnest(p_ids) x) <> n
     or exists (select 1 from unnest(p_ids) x where not exists (
                  select 1 from group_roles r where r.id = x and r.group_id = p_gid and not r.is_default)) then
    raise exception '身分組清單不完整，請重新整理後再試';
  end if;

  is_super := group_is_super(p_gid, uid);
  top := group_top_position(p_gid, uid);

  if not is_super and exists (
    select 1
    from (
      select r.id, r.position,
             n - row_number() over (order by r.position desc, r.created_at, r.id) + 1 as old_rank
      from group_roles r where r.group_id = p_gid and not r.is_default
    ) cur
    join unnest(p_ids) with ordinality as x(id, ord) on x.id = cur.id
    where cur.position >= top and cur.old_rank <> n - x.ord + 1
  ) then
    raise exception '只能管理比你目前最高身分組還低的身分組 / 成員';
  end if;

  update group_roles r set position = n - x.ord + 1
  from unnest(p_ids) with ordinality as x(id, ord)
  where r.id = x.id and r.group_id = p_gid;

  perform audit(p_gid, uid, 'group.role.reorder', 'group', p_gid::text,
                jsonb_build_object('name', (select name from groups where id = p_gid), 'role_ids', p_ids));
end;
$$;


-- ============================================================
-- 8. 驗證碼
-- 讀寫一律走 security definer RPC；totp_* 是相容舊版前端的個人 RPC（名稱、參數、回傳格式不變），
-- 改成操作自己的預設群組。
-- ============================================================

-- ---------- 內部 helper ----------

-- jsonb 欄位值 → 合法的位數 / 週期 / 演算法；不合法時用 fallback
create function public.totp_norm_digits(v jsonb, fallback int)
returns int
language sql
immutable
as $$
  select case when v is not null and jsonb_typeof(v) in ('number', 'string') and (v #>> '{}') in ('6', '8')
              then (v #>> '{}')::int else fallback end;
$$;

create function public.totp_norm_period(v jsonb, fallback int)
returns int
language sql
immutable
as $$
  select case when v is not null and jsonb_typeof(v) in ('number', 'string') and (v #>> '{}') in ('30', '60')
              then (v #>> '{}')::int else fallback end;
$$;

create function public.totp_norm_algorithm(v jsonb, fallback text)
returns text
language sql
immutable
as $$
  select case when v is not null and jsonb_typeof(v) = 'string' and (v #>> '{}') in ('SHA-1', 'SHA-256', 'SHA-512')
              then v #>> '{}' else fallback end;
$$;

-- jsonb 值 → boolean（true / "true" 才算 true）；null 時用 fallback
create function public.totp_norm_bool(v jsonb, fallback boolean)
returns boolean
language sql
immutable
as $$
  select case when v is null or jsonb_typeof(v) = 'null' then fallback
              else lower(v #>> '{}') = 'true' end;
$$;

-- jsonb 值 → 文字（null / 缺少時用 fallback）
create function public.totp_norm_text(v jsonb, fallback text)
returns text
language sql
immutable
as $$
  select case when v is null or jsonb_typeof(v) = 'null' then fallback else v #>> '{}' end;
$$;

-- 把 jsonb 陣列（TotpItem / TotpInput）接在個人或群組清單的最後面；回傳新增的 id（依陣列順序）
-- id 是合法 uuid 且還沒被用過就沿用，否則重新產生；欄位不合法時用預設值
create function public.totp_import_items(p_owner uuid, p_group uuid, p_items jsonb, p_created_by uuid)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  next_pos int;
  new_id uuid;
  raw_id text;
  ids uuid[] := '{}';
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return ids;
  end if;

  select coalesce(max(position) + 1, 0) into next_pos
  from totp_accounts
  where (p_owner is not null and owner_id = p_owner)
     or (p_group is not null and group_id = p_group);

  for item in select e from jsonb_array_elements(p_items) with ordinality as t(e, ord) order by ord loop
    continue when jsonb_typeof(item) <> 'object';

    raw_id := lower(trim(coalesce(item ->> 'id', '')));
    if raw_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and not exists (select 1 from totp_accounts where id = raw_id::uuid) then
      new_id := raw_id::uuid;
    else
      new_id := gen_random_uuid();
    end if;

    insert into totp_accounts (id, owner_id, group_id, name, category, digits, period, algorithm, pinned, position, created_by)
    values (
      new_id, p_owner, p_group,
      totp_norm_text(item -> 'name', ''),
      totp_norm_text(item -> 'category', ''),
      totp_norm_digits(item -> 'digits', 6),
      totp_norm_period(item -> 'period', 30),
      totp_norm_algorithm(item -> 'algorithm', 'SHA-1'),
      totp_norm_bool(item -> 'pinned', false),
      next_pos,
      p_created_by
    );
    insert into totp_secrets (account_id, secret)
    values (new_id, totp_norm_text(item -> 'secret', ''));

    next_pos := next_pos + 1;
    ids := ids || new_id;
  end loop;

  return ids;
end;
$$;

-- 新增 / 修改驗證碼的上限：一次最多 500 筆、名稱與類別最多 200 字、金鑰最多 2048 字；超過就 raise。
-- 只在使用者的 RPC 路徑檢查（group_add_items、totp_apply_patch），接回舊資料（profiles_totp_to_accounts）不擋
create function public.totp_assert_caps(p_items jsonb)
returns void
language plpgsql
immutable
as $$
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return;
  end if;
  if jsonb_array_length(p_items) > 500 then
    raise exception '一次最多新增 500 筆驗證碼';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) e
             where jsonb_typeof(e) = 'object' and char_length(totp_norm_text(e -> 'name', '')) > 200) then
    raise exception '驗證碼名稱最多 200 個字';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) e
             where jsonb_typeof(e) = 'object' and char_length(totp_norm_text(e -> 'category', '')) > 200) then
    raise exception '類別最多 200 個字';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) e
             where jsonb_typeof(e) = 'object' and char_length(totp_norm_text(e -> 'secret', '')) > 2048) then
    raise exception '金鑰最多 2048 個字';
  end if;
end;
$$;

-- 套用 patch 到一筆驗證碼（只改 patch 裡有的欄位；secret 寫到 totp_secrets；檢查上限）
create function public.totp_apply_patch(p_account uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return;
  end if;
  perform totp_assert_caps(jsonb_build_array(p_patch));

  update totp_accounts a
  set name      = case when p_patch ? 'name' then totp_norm_text(p_patch -> 'name', '') else a.name end,
      category  = case when p_patch ? 'category' then totp_norm_text(p_patch -> 'category', '') else a.category end,
      digits    = case when p_patch ? 'digits' then totp_norm_digits(p_patch -> 'digits', a.digits) else a.digits end,
      period    = case when p_patch ? 'period' then totp_norm_period(p_patch -> 'period', a.period) else a.period end,
      algorithm = case when p_patch ? 'algorithm' then totp_norm_algorithm(p_patch -> 'algorithm', a.algorithm) else a.algorithm end,
      pinned    = case when p_patch ? 'pinned' then totp_norm_bool(p_patch -> 'pinned', a.pinned) else a.pinned end,
      updated_at = now()
  where a.id = p_account;

  if p_patch ? 'secret' then
    insert into totp_secrets (account_id, secret)
    values (p_account, totp_norm_text(p_patch -> 'secret', ''))
    on conflict (account_id) do update set secret = excluded.secret;
  end if;
end;
$$;

-- 依 ids 重新排序個人或群組清單；不在 ids 裡的照原順序接在後面
create function public.totp_reorder_items(p_owner uuid, p_group uuid, p_ids text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update totp_accounts a
  set position = s.rn - 1
  from (
    select x.id,
           row_number() over (order by o.ord nulls last, x.position, x.created_at, x.id) as rn
    from totp_accounts x
    left join (
      select lower(trim(u.id)) as id, min(u.ord) as ord
      from unnest(coalesce(p_ids, '{}')) with ordinality as u(id, ord)
      group by lower(trim(u.id))
    ) o on o.id = x.id::text
    where (p_owner is not null and x.owner_id = p_owner)
       or (p_group is not null and x.group_id = p_group)
  ) s
  where a.id = s.id and a.position <> s.rn - 1;
end;
$$;

-- 個人清單（TotpItem[]，依 position 排序）
create function public.totp_items_json(p_owner uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id, 'name', a.name, 'secret', coalesce(s.secret, ''), 'category', a.category,
        'digits', a.digits, 'period', a.period, 'algorithm', a.algorithm, 'pinned', a.pinned
      )
      order by a.position, a.created_at, a.id
    ),
    '[]'::jsonb
  )
  from totp_accounts a
  left join totp_secrets s on s.account_id = a.id
  where a.owner_id = p_owner;
$$;

-- 目前登入者有 profile 時回傳 uid，否則 null（未登入 / 沒有 profile 時 RPC 回傳 null）
create function public.totp_current_owner()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id from profiles p where p.id = auth.uid();
$$;

-- items（TotpInput 陣列）裡的金鑰
create function public.totp_items_secrets(p_items jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(coalesce(e ->> 'secret', '')), '{}')
  from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) e
  where jsonb_typeof(e) = 'object';
$$;

-- 群組清單（TotpItem[]，含金鑰，依 position 排序）：給相容用的 totp_* RPC 回傳
create function public.totp_group_items_json(p_gid uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id, 'name', a.name, 'secret', coalesce(s.secret, ''), 'category', a.category,
        'digits', a.digits, 'period', a.period, 'algorithm', a.algorithm, 'pinned', a.pinned
      )
      order by a.position, a.created_at, a.id
    ),
    '[]'::jsonb
  )
  from totp_accounts a
  left join totp_secrets s on s.account_id = a.id
  where a.group_id = p_gid;
$$;

-- 寫進群組的金鑰格式要和群組的加密狀態一致：加密的群組只收 enc:v1: 密文，沒加密的不收密文
create function public.group_assert_secret_format(p_gid uuid, p_secrets text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  enc boolean;
begin
  -- 鎖住群組列（共享鎖）：和 group_set_encrypted / totp_set_vault 互斥，避免切換加密的同時寫入另一種格式
  select g.encrypted into enc from groups g where g.id = p_gid for share;
  if enc is null or p_secrets is null then
    return;
  end if;
  if enc and exists (select 1 from unnest(p_secrets) s where coalesce(s, '') not like 'enc:v1:%') then
    raise exception '這個群組已加密，請重新整理並解鎖後再試';
  end if;
  if not enc and exists (select 1 from unnest(p_secrets) s where coalesce(s, '') like 'enc:v1:%') then
    raise exception '這個群組沒有加密，不能存入加密後的金鑰，請重新整理後再試';
  end if;
end;
$$;

-- 新增驗證碼到群組（不檢查權限）：檢查上限與金鑰格式、匯入、記錄；回傳新增的 id
create function public.group_add_items(p_gid uuid, p_items jsonb, p_uid uuid)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  ids uuid[];
begin
  perform totp_assert_caps(p_items);
  perform group_assert_secret_format(p_gid, totp_items_secrets(p_items));
  ids := totp_import_items(null, p_gid, p_items, p_uid);
  insert into audit_logs (group_id, actor_id, action, target_type, target_id, detail)
  select p_gid, p_uid, 'group.account.create', 'account', a.id::text, jsonb_build_object('name', a.name)
  from totp_accounts a where a.id = any (ids);
  -- 通知看得到這些驗證碼的其他成員（一次匯入多筆只產生一則）
  perform notify_codes_changed(p_gid, p_uid, ids, cardinality(ids), 0);
  return ids;
end;
$$;

-- ---------- 單筆驗證碼權限 ----------

-- 單筆驗證碼權限（Discord 頻道算法）：
-- base 含 ADMINISTRATOR → GROUP_ALL；依序套用 @everyone、成員身分組（allow / deny 各自 OR）、成員本人的覆寫；
-- 最後沒有 VIEW_CODES → 0
create function public.account_permissions(p_account uuid, p_uid uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  gid uuid;
  base bigint;
  everyone_id uuid;
  a bigint;
  d bigint;
begin
  select group_id into gid from totp_accounts where id = p_account;
  if gid is null or p_uid is null then
    return 0;
  end if;

  base := group_permissions(gid, p_uid);
  if base & 1 <> 0 then
    return 1023;
  end if;
  if not group_is_member(gid, p_uid) then
    return 0;
  end if;

  -- @everyone
  select id into everyone_id from group_roles where group_id = gid and is_default;
  select coalesce(o.allow, 0) & 14, coalesce(o.deny, 0) & 14 into a, d
  from group_account_overwrites o
  where o.account_id = p_account and o.target_type = 'role' and o.target_id = everyone_id;
  base := (base & ~coalesce(d, 0)) | coalesce(a, 0);

  -- 成員的所有身分組
  select coalesce(bit_or(o.allow), 0) & 14, coalesce(bit_or(o.deny), 0) & 14 into a, d
  from group_account_overwrites o
  join group_member_roles mr on mr.role_id = o.target_id and mr.group_id = gid and mr.user_id = p_uid
  where o.account_id = p_account and o.target_type = 'role' and o.target_id is distinct from everyone_id;
  base := (base & ~coalesce(d, 0)) | coalesce(a, 0);

  -- 成員本人
  a := null; d := null;
  select o.allow & 14, o.deny & 14 into a, d
  from group_account_overwrites o
  where o.account_id = p_account and o.target_type = 'member' and o.target_id = p_uid;
  base := (base & ~coalesce(d, 0)) | coalesce(a, 0);

  if base & 2 = 0 then
    return 0;
  end if;
  return base;
end;
$$;

-- 群組驗證碼所屬的群組；找不到（或是個人的）就 raise
create function public.account_group(p_account uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  gid uuid;
begin
  select group_id into gid from totp_accounts where id = p_account;
  if gid is null then
    raise exception '找不到這筆驗證碼';
  end if;
  return gid;
end;
$$;

-- 單筆驗證碼需要指定權限，否則 raise；看不到的驗證碼當作不存在
create function public.account_require(p_account uuid, p_uid uuid, p_bit bigint)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  gid uuid := account_group(p_account);
  perms bigint;
begin
  perform group_require(gid, p_uid, 0);
  perms := account_permissions(p_account, p_uid);
  if perms & 2 = 0 then
    raise exception '找不到這筆驗證碼';
  end if;
  if perms & p_bit = 0 then
    raise exception '權限不足：需要「%」', group_perm_name(p_bit);
  end if;
  return perms;
end;
$$;

-- ---------- 群組驗證碼 RPC ----------

-- 群組驗證碼清單（成員）：只回傳有 VIEW_CODES 的，依 position 排序；不含金鑰
create function public.group_accounts(gid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_accounts.gid;
begin
  perform group_require(p_gid, uid, 0);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'name', a.name, 'category', a.category, 'digits', a.digits, 'period', a.period,
      'algorithm', a.algorithm, 'pinned', a.pinned, 'permissions', a.perms,
      'has_overwrites', exists (select 1 from group_account_overwrites o where o.account_id = a.id)
    ) order by a.position, a.created_at, a.id)
    from (
      select t.*, account_permissions(t.id, uid) as perms
      from totp_accounts t where t.group_id = p_gid
    ) a
    where a.perms & 2 <> 0
  ), '[]'::jsonb);
end;
$$;

-- 新增群組驗證碼（群組層級 MANAGE_CODES）：items 同個人 TotpInput；金鑰格式要和加密狀態一致；回傳新增的 id
create function public.group_account_add(gid uuid, items jsonb)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_account_add.gid;
begin
  perform group_require(p_gid, uid, 8);
  return group_add_items(p_gid, group_account_add.items, uid);
end;
$$;

-- 編輯群組驗證碼（該筆的 MANAGE_CODES）；改 secret 不需要 VIEW_SECRETS，但格式要和加密狀態一致
create function public.group_account_update(account_id uuid, patch jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_account uuid := group_account_update.account_id;
  p_patch jsonb := group_account_update.patch;
  fields jsonb;
begin
  perform account_require(p_account, uid, 8);
  if jsonb_typeof(p_patch) = 'object' and p_patch ? 'secret' then
    perform group_assert_secret_format(account_group(p_account), array[coalesce(p_patch ->> 'secret', '')]);
  end if;
  perform totp_apply_patch(p_account, p_patch);
  select coalesce(jsonb_agg(k), '[]'::jsonb) into fields
  from jsonb_object_keys(case when jsonb_typeof(p_patch) = 'object' then p_patch else '{}'::jsonb end) k
  where k in ('name', 'category', 'secret', 'digits', 'period', 'algorithm', 'pinned');
  perform audit(account_group(p_account), uid, 'group.account.update', 'account', p_account::text,
                jsonb_build_object('name', (select name from totp_accounts where id = p_account), 'fields', fields));
end;
$$;

-- 刪除群組驗證碼（該筆的 MANAGE_CODES）
create function public.group_account_delete(account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_account uuid := group_account_delete.account_id;
  a totp_accounts%rowtype;
begin
  perform account_require(p_account, uid, 8);
  select * into a from totp_accounts where id = p_account;
  -- 刪掉之前算：看得到這筆的其他成員
  perform notify_codes_changed(a.group_id, uid, array[p_account], 0, 1);
  delete from totp_accounts where id = p_account;
  perform audit(a.group_id, uid, 'group.account.delete', 'account', p_account::text, jsonb_build_object('name', a.name));
end;
$$;

-- 群組驗證碼排序（群組層級 MANAGE_CODES）：看得到的驗證碼依 ids 排進「看得到的驗證碼原本佔的位置」，
-- ids 裡沒有的照原順序接在後面；看不到的（單筆覆寫拒絕 VIEW_CODES）位置不變，ids 裡看不到的 id 直接忽略
create function public.group_accounts_reorder(gid uuid, ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_accounts_reorder.gid;
begin
  perform group_require(p_gid, uid, 8);
  -- 看得到的驗證碼依 ids 的順序（沒列到的照原順序接在後面）排進「看得到的驗證碼原本佔的位置」；
  -- 看不到的（單筆覆寫拒絕 VIEW_CODES）位置不變，ids 裡的看不到的 id 直接忽略
  update totp_accounts a
  set position = f.slot - 1
  from (
    with cur as (
      select x.id,
             row_number() over (order by x.position, x.created_at, x.id) as rn,
             account_permissions(x.id, uid) & 2 <> 0 as visible
      from totp_accounts x
      where x.group_id = p_gid
    ),
    req as (
      select u.id, min(u.ord) as ord
      from unnest(coalesce(group_accounts_reorder.ids, '{}')) with ordinality as u(id, ord)
      group by u.id
    ),
    vis_new as (
      select c.id, row_number() over (order by q.ord nulls last, c.rn) as k
      from cur c left join req q on q.id = c.id
      where c.visible
    ),
    vis_slots as (
      select c.rn, row_number() over (order by c.rn) as k
      from cur c
      where c.visible
    )
    select v.id, s.rn as slot from vis_new v join vis_slots s on s.k = v.k
    union all
    select c.id, c.rn from cur c where not c.visible
  ) f
  where a.id = f.id and a.position <> f.slot - 1;
end;
$$;

-- 設定群組的類別順序（群組層級 MANAGE_CODES）：names 由前到後；回傳整理後的陣列。
-- 去頭尾空白、去空、去重（保留第一次出現的位置）；每個名稱最多 50 個字、不能含逗號或頓號，最多 200 個。
-- 順序真的有變才記 group.category.reorder
create function public.group_set_category_order(gid uuid, names text[])
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_set_category_order.gid;
  normalized text[];
  old_order text[];
begin
  perform group_require(p_gid, uid, 8);

  if exists (select 1 from unnest(coalesce(group_set_category_order.names, '{}')) x
             where char_length(trim(x)) > 50) then
    raise exception '類別名稱最多 50 個字';
  end if;
  if exists (select 1 from unnest(coalesce(group_set_category_order.names, '{}')) x
             where trim(x) ~ '[,，、]') then
    raise exception '類別名稱不能包含逗號或頓號';
  end if;

  -- 去頭尾空白、去空、去重（保留第一次出現的位置）
  select coalesce(array_agg(n order by first_ord), '{}') into normalized
  from (
    select trim(x) as n, min(ord) as first_ord
    from unnest(coalesce(group_set_category_order.names, '{}')) with ordinality as u(x, ord)
    where nullif(trim(x), '') is not null
    group by trim(x)
  ) s;

  if cardinality(normalized) > 200 then
    raise exception '類別最多 200 個';
  end if;

  -- 鎖住群組列：同時排序時後送的那一次為準，紀錄的舊順序也對得上
  select g.category_order into old_order from groups g where g.id = p_gid for update;

  if old_order is distinct from normalized then
    update groups g set category_order = normalized where g.id = p_gid;
    perform audit(p_gid, uid, 'group.category.reorder', 'group', p_gid::text,
                  jsonb_build_object('name', (select name from groups where id = p_gid),
                                     'categories', to_jsonb(normalized),
                                     'old_categories', to_jsonb(old_order)));
  end if;

  return normalized;
end;
$$;

-- 清空群組裡我能管理（該筆有 MANAGE_CODES）的驗證碼（群組層級 MANAGE_CODES）；回傳刪除筆數
create function public.group_accounts_clear(gid uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_accounts_clear.gid;
  n int;
  ids uuid[];
begin
  perform group_require(p_gid, uid, 8);
  ids := array(select a.id from totp_accounts a where a.group_id = p_gid and account_permissions(a.id, uid) & 8 <> 0);
  -- 刪掉之前算：看得到其中至少一筆的其他成員
  perform notify_codes_changed(p_gid, uid, ids, 0, cardinality(ids));
  delete from totp_accounts a where a.id = any (ids);
  get diagnostics n = row_count;
  if n > 0 then
    perform audit(p_gid, uid, 'group.account.clear', 'group', p_gid::text,
                  jsonb_build_object('name', (select name from groups where id = p_gid), 'count', n));
  end if;
  return n;
end;
$$;

-- 取得單筆金鑰（該筆的 VIEW_SECRETS）；記錄 group.account.secret.view
create function public.group_account_secret(account_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_account uuid := group_account_secret.account_id;
  s text;
begin
  perform account_require(p_account, uid, 4);
  select secret into s from totp_secrets where totp_secrets.account_id = p_account;
  perform audit(account_group(p_account), uid, 'group.account.secret.view', 'account', p_account::text,
                jsonb_build_object('name', (select name from totp_accounts where id = p_account))
                  || audit_via_site(account_group(p_account), uid));
  return s;
end;
$$;

-- 取得群組內所有「呼叫者有 VIEW_SECRETS」的金鑰：{ "<account_id>": "<secret>" }；記錄一筆 secret.view（帶數量）
create function public.group_account_secrets(gid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_account_secrets.gid;
  result jsonb;
  n int;
begin
  perform group_require(p_gid, uid, 0);
  select coalesce(jsonb_object_agg(a.id::text, coalesce(s.secret, '')), '{}'::jsonb), count(*)
  into result, n
  from totp_accounts a
  left join totp_secrets s on s.account_id = a.id
  where a.group_id = p_gid and account_permissions(a.id, uid) & 4 <> 0;
  if n > 0 then
    perform audit(p_gid, uid, 'group.account.secret.view', 'group', p_gid::text,
                  jsonb_build_object('name', (select name from groups where id = p_gid), 'count', n)
                    || audit_via_site(p_gid, uid));
  end if;
  return result;
end;
$$;

-- 單筆驗證碼的覆寫清單（MANAGE_ROLES）：[{ target_type, target_id, allow, deny }]
create function public.group_account_overwrites(account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_account uuid := group_account_overwrites.account_id;
begin
  perform group_require(account_group(p_account), uid, 64);
  return coalesce((
    select jsonb_agg(jsonb_build_object('target_type', o.target_type, 'target_id', o.target_id,
                                        'allow', o.allow, 'deny', o.deny)
                     order by o.target_type desc, o.target_id)
    from group_account_overwrites o where o.account_id = p_account
  ), '[]'::jsonb);
end;
$$;

-- 設定單筆驗證碼覆寫（MANAGE_ROLES + 階層）：allow、deny 都是 0 就刪除；只保留可覆寫的位元；
-- 允許與拒絕中有變動的位元（新舊 XOR）都必須是呼叫者在這筆驗證碼本身就有的權限（擁有者 / 全站管理例外）
create function public.group_set_overwrite(account_id uuid, target_type text, target_id uuid, allow bigint, deny bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_account uuid := group_set_overwrite.account_id;
  p_type text := group_set_overwrite.target_type;
  p_target uuid := group_set_overwrite.target_id;
  p_allow bigint := coalesce(group_set_overwrite.allow, 0) & 14;
  p_deny bigint := coalesce(group_set_overwrite.deny, 0) & 14;
  gid uuid := account_group(p_account);
  r group_roles%rowtype;
  old_allow bigint;
  old_deny bigint;
  changed bigint;
begin
  perform group_require(gid, uid, 64);
  if p_allow & p_deny <> 0 then
    raise exception '同一個權限不能同時設定允許與拒絕';
  end if;

  if p_type = 'role' then
    select * into r from group_roles where id = p_target and group_id = gid;
    if r.id is null then
      raise exception '找不到這個身分組';
    end if;
    if not r.is_default and not group_can_manage_position(gid, uid, r.position) then
      raise exception '只能管理比你目前最高身分組還低的身分組 / 成員';
    end if;
  elsif p_type = 'member' then
    if not group_is_member(gid, p_target) then
      raise exception '對方不是這個群組的成員';
    end if;
    if not group_can_manage_member(gid, uid, p_target) then
      raise exception '只能管理比你目前最高身分組還低的身分組 / 成員';
    end if;
  else
    raise exception '覆寫對象只能是身分組或成員';
  end if;

  select o.allow, o.deny into old_allow, old_deny from group_account_overwrites o
  where o.account_id = p_account and o.target_type = p_type and o.target_id = p_target
  for update;
  changed := (p_allow # coalesce(old_allow, 0)) | (p_deny # coalesce(old_deny, 0));
  if not group_is_super(gid, uid) and changed & ~account_permissions(p_account, uid) <> 0 then
    raise exception '只能變更你自己在這筆驗證碼擁有的權限';
  end if;

  if p_allow = 0 and p_deny = 0 then
    delete from group_account_overwrites o
    where o.account_id = p_account and o.target_type = p_type and o.target_id = p_target;
  else
    insert into group_account_overwrites (account_id, target_type, target_id, allow, deny)
    values (p_account, p_type, p_target, p_allow, p_deny)
    on conflict on constraint group_account_overwrites_pkey
    do update set allow = excluded.allow, deny = excluded.deny;
  end if;

  perform audit(gid, uid, 'group.account.overwrite', 'account', p_account::text, jsonb_build_object(
    'name', (select name from totp_accounts where id = p_account),
    'target_type', p_type, 'target_id', p_target, 'allow', p_allow, 'deny', p_deny));
end;
$$;

-- 呼叫者有 VIEW_CODES 的驗證碼 id（給 /api/groups/codes）；加密的群組回傳空陣列（金鑰是密文，由擁有者在瀏覽器解密產碼）
create function public.group_codes_permitted(gid uuid)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_codes_permitted.gid;
begin
  perform group_require(p_gid, uid, 0);
  if exists (select 1 from groups g where g.id = p_gid and g.encrypted) then
    return '{}';
  end if;
  return coalesce((
    select array_agg(a.id order by a.position, a.created_at, a.id)
    from totp_accounts a
    where a.group_id = p_gid and account_permissions(a.id, uid) & 2 <> 0
  ), '{}');
end;
$$;

-- ---------- 相容用的個人驗證碼 RPC（操作自己的預設群組）----------

-- 自己的預設群組（沒有就建立）；未登入 / 沒有 profile 回傳 null
create function public.totp_default_group()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := totp_current_owner();
begin
  if uid is null then
    return null;
  end if;
  return ensure_default_group(uid);
end;
$$;

-- 讀取自己預設群組的全部驗證碼
create function public.totp_list()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  gid uuid := totp_default_group();
begin
  if gid is null then
    return null;
  end if;
  return totp_group_items_json(gid);
end;
$$;

-- 新增（陣列；每筆可帶 id，沒帶就產生），接在最後
create function public.totp_add(items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid := totp_default_group();
begin
  if gid is null then
    return null;
  end if;
  perform group_add_items(gid, totp_add.items, auth.uid());
  return totp_group_items_json(gid);
end;
$$;

-- 只改 patch 裡有的欄位；找不到該筆回傳 null
create function public.totp_update(item_id text, patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid := totp_default_group();
  target uuid;
begin
  if gid is null then
    return null;
  end if;
  select a.id into target from totp_accounts a
  where a.group_id = gid and a.id::text = lower(trim(totp_update.item_id));
  if target is null then
    return null;
  end if;
  if jsonb_typeof(totp_update.patch) = 'object' and totp_update.patch ? 'secret' then
    perform group_assert_secret_format(gid, array[coalesce(totp_update.patch ->> 'secret', '')]);
  end if;
  perform totp_apply_patch(target, totp_update.patch);
  return totp_group_items_json(gid);
end;
$$;

-- 刪除一筆
create function public.totp_delete(item_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid := totp_default_group();
  ids uuid[];
begin
  if gid is null then
    return null;
  end if;
  ids := array(select a.id from totp_accounts a where a.group_id = gid and a.id::text = lower(trim(totp_delete.item_id)));
  perform notify_codes_changed(gid, auth.uid(), ids, 0, cardinality(ids));
  delete from totp_accounts a where a.id = any (ids);
  return totp_group_items_json(gid);
end;
$$;

-- 全部刪除
create function public.totp_clear()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid := totp_default_group();
  ids uuid[];
begin
  if gid is null then
    return null;
  end if;
  ids := array(select a.id from totp_accounts a where a.group_id = gid);
  perform notify_codes_changed(gid, auth.uid(), ids, 0, cardinality(ids));
  delete from totp_accounts a where a.id = any (ids);
  return '[]'::jsonb;
end;
$$;

-- 依 ids 重排，不在 ids 裡的照原順序接在後面
create function public.totp_reorder(ids text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid := totp_default_group();
begin
  if gid is null then
    return null;
  end if;
  perform totp_reorder_items(null, gid, totp_reorder.ids);
  return totp_group_items_json(gid);
end;
$$;


-- ============================================================
-- 9. 金鑰加密
-- 加密套用在群組上（groups.encrypted），用擁有者自己的 vault（profiles.vault）加解密。
-- 鎖的順序一律「先鎖 profile 再鎖群組」，避免 totp_set_vault 與 group_set_encrypted 互相卡住。
-- ============================================================

-- 加密設定的格式：{ v: 1, salt: 16 bytes 的 base64, iterations: 600000～5000000, check: 'enc:v1:...' }
create function public.vault_info_valid(v jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(
    jsonb_typeof(v) = 'object'
    and jsonb_typeof(v -> 'v') = 'number' and (v -> 'v') = '1'::jsonb
    and jsonb_typeof(v -> 'salt') = 'string' and (v ->> 'salt') ~ '^[A-Za-z0-9+/]{22}==$'
    and jsonb_typeof(v -> 'iterations') = 'number'
    and case when (v ->> 'iterations') ~ '^[0-9]{1,9}$'
             then (v ->> 'iterations')::int between 600000 and 5000000 else false end
    and jsonb_typeof(v -> 'check') = 'string' and (v ->> 'check') like 'enc:v1:%',
    false);
$$;

-- 託管密文（esc:v1:<kid>:<epk>:<iv>:<ct>，base64）的 key id；格式不對就 raise
create function public.vault_escrow_key_id(p_escrow text)
returns text
language plpgsql
immutable
as $$
begin
  if p_escrow is null or char_length(p_escrow) > 4096
     or p_escrow !~ '^esc:v1:[0-9a-f]{16}:[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}$' then
    raise exception '託管資料格式不正確';
  end if;
  return split_part(p_escrow, ':', 3);
end;
$$;

-- 更新 vault 並一次換掉多筆金鑰（secrets：{ "<account id>": "<secret>" }），回傳預設群組的清單。
-- new_vault 格式不對（vault_info_valid）就 raise「加密設定格式不正確」。
-- escrow（選用，舊版不傳）：新密碼的託管密文，同一個交易寫進 vault_escrow（停用加密時忽略）。
-- expected_check：呼叫端以為目前的 vault.check（未啟用為 null）；和資料庫不同代表別的裝置改過，raise。
-- 加密設定有變（改密碼、停用）時 secrets 必須涵蓋「自己擁有且已加密的群組」的全部驗證碼；
-- 有加密時金鑰都要是 enc:v1: 密文，停用時都要是明文，且那些群組一起改成沒加密。
-- 啟用（原本沒有 vault）時還沒有加密的群組，只設定密碼；要加密哪個群組另外呼叫 group_set_encrypted。
create function public.totp_set_vault(new_vault jsonb, secrets jsonb, expected_check text default null, escrow text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := totp_current_owner();
  s jsonb := case when jsonb_typeof(totp_set_vault.secrets) = 'object' then totp_set_vault.secrets else '{}'::jsonb end;
  v jsonb := nullif(totp_set_vault.new_vault, 'null'::jsonb);
  cur jsonb;
  enc uuid[];
  kid text;
begin
  if uid is null then
    return null;
  end if;
  if v is not null and not vault_info_valid(v) then
    raise exception '加密設定格式不正確';
  end if;
  -- 託管密文（選用；舊版不傳）：停用加密時沒有對應的 vault.check，不存
  if totp_set_vault.escrow is not null and v is not null then
    kid := vault_escrow_key_id(totp_set_vault.escrow);
  end if;

  -- 先鎖 profile 再鎖群組（和 group_set_encrypted 同順序）
  select p.vault into cur from profiles p where p.id = uid for update;
  if (cur ->> 'check') is distinct from totp_set_vault.expected_check then
    raise exception '加密設定已在其他裝置變更，請重新整理';
  end if;

  perform 1 from groups g where g.owner_id = uid and g.encrypted order by g.id for update;
  select coalesce(array_agg(g.id), '{}') into enc from groups g where g.owner_id = uid and g.encrypted;

  if (v ->> 'check') is distinct from (cur ->> 'check')
     and exists (select 1 from totp_accounts a where a.group_id = any (enc) and not (s ? a.id::text)) then
    raise exception '驗證碼清單已在其他裝置變更，請重新整理後再試';
  end if;

  if exists (
    select 1 from totp_accounts a
    where a.group_id = any (enc) and s ? a.id::text
      and (jsonb_typeof(s -> a.id::text) <> 'string'
           or (v is not null) <> ((s ->> a.id::text) like 'enc:v1:%'))
  ) then
    raise exception '金鑰格式和加密設定不一致，請重新整理後再試';
  end if;

  update profiles set vault = v, updated_at = now() where id = uid;

  update totp_secrets t
  set secret = s ->> a.id::text
  from totp_accounts a
  where a.id = t.account_id
    and a.group_id = any (enc)
    and s ? a.id::text;

  if v is null and cardinality(enc) > 0 then
    update groups set encrypted = false where id = any (enc);
    insert into audit_logs (group_id, actor_id, action, target_type, target_id, detail)
    select g.id, uid, 'group.encryption.disable', 'group', g.id::text, jsonb_build_object('name', g.name)
    from groups g where g.id = any (enc);
    -- 通知這些群組的其他成員（加密的群組只有擁有者一個成員，通常沒有人）
    perform notify(array(select m.user_id from group_members m where m.group_id = g.id), 'group_encryption_changed',
                   '群組加密已變更', format('%s 關閉了「%s」的加密。', notify_name(uid), g.name), '/groups/' || g.id::text,
                   jsonb_build_object('group_id', g.id, 'actor_id', uid, 'encrypted', false))
    from groups g where g.id = any (enc);
  end if;

  if kid is not null then
    insert into vault_escrow (user_id, email, key_id, envelope, vault_check)
    values (uid, (select u.email from auth.users u where u.id = uid), kid, totp_set_vault.escrow, v ->> 'check');
  end if;

  return totp_group_items_json(ensure_default_group(uid));
end;
$$;

-- 補登託管密文：存成目前 profiles.vault.check 的那一組；還沒設定加密密碼就 raise。
-- 同一組加密設定最多存 10 筆，超過時不再新增（不 raise）
create function public.vault_escrow_put(escrow text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  kid text := vault_escrow_key_id(vault_escrow_put.escrow);
  cur jsonb;
begin
  -- 鎖住 profile：和 totp_set_vault 互斥，存進去的一定對應目前的 vault.check
  select p.vault into cur from profiles p where p.id = uid for update;
  if cur is null or coalesce(cur ->> 'check', '') = '' then
    raise exception '還沒有設定加密密碼';
  end if;
  -- 同一組加密設定最多存 10 筆（避免重複呼叫灌資料）；超過時不再新增
  if (select count(*) from vault_escrow e where e.user_id = uid and e.vault_check = cur ->> 'check') >= 10 then
    return;
  end if;
  insert into vault_escrow (user_id, email, key_id, envelope, vault_check)
  values (uid, (select u.email from auth.users u where u.id = uid), kid, vault_escrow_put.escrow, cur ->> 'check');
end;
$$;

-- 目前的加密密碼是否還沒有託管密文（有 vault、但沒有 vault_check = 目前 vault.check 的列）；
-- 用加密密碼解鎖成功後呼叫，true 時用剛輸入的密碼呼叫 vault_escrow_put
create function public.vault_escrow_needed()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
begin
  return coalesce((
    select coalesce(p.vault ->> 'check', '') <> ''
       and not exists (select 1 from vault_escrow e where e.user_id = p.id and e.vault_check = p.vault ->> 'check')
    from profiles p
    where p.id = uid
  ), false);
end;
$$;

-- 忘記加密密碼：刪除自己擁有且已加密的群組裡的驗證碼，這些群組改成沒加密，並停用 vault；
-- 另外標記這次停用是「重設」（profiles_activity 記 user.vault.reset）
create function public.vault_reset()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  enc uuid[];
begin
  perform 1 from profiles p where p.id = uid for update;
  perform 1 from groups g where g.owner_id = uid and g.encrypted order by g.id for update;
  select coalesce(array_agg(g.id), '{}') into enc from groups g where g.owner_id = uid and g.encrypted;

  delete from totp_accounts a where a.group_id = any (enc);
  update groups set encrypted = false where id = any (enc);
  perform set_config('securibit.vault_reset', 'on', true);
  update profiles set vault = null, updated_at = now() where id = uid;
  perform set_config('securibit.vault_reset', '', true);

  insert into audit_logs (group_id, actor_id, action, target_type, target_id, detail)
  select g.id, uid, 'group.encryption.disable', 'group', g.id::text, jsonb_build_object('name', g.name, 'reset', true)
  from groups g where g.id = any (enc);
  perform notify(array(select m.user_id from group_members m where m.group_id = g.id), 'group_encryption_changed',
                 '群組加密已變更', format('%s 關閉了「%s」的加密。', notify_name(uid), g.name), '/groups/' || g.id::text,
                 jsonb_build_object('group_id', g.id, 'actor_id', uid, 'encrypted', false))
  from groups g where g.id = any (enc);
end;
$$;

-- 開啟 / 關閉群組加密（只有擁有者）：secrets 必須涵蓋群組全部驗證碼，開啟時都是 enc:v1: 密文、關閉時都是明文。
-- expected_check：呼叫端用來加解密的 vault.check，和資料庫不同就 raise。
-- 開啟條件：已設定加密密碼、群組只有擁有者一個成員；開啟時撤銷所有邀請連結、刪除 Email / @ID 邀請。
create function public.group_set_encrypted(gid uuid, encrypted boolean, secrets jsonb, expected_check text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_set_encrypted.gid;
  p_on boolean := coalesce(group_set_encrypted.encrypted, false);
  s jsonb := case when jsonb_typeof(group_set_encrypted.secrets) = 'object' then group_set_encrypted.secrets else '{}'::jsonb end;
  cur jsonb;
  g groups%rowtype;
begin
  if not exists (select 1 from groups x where x.id = p_gid) then
    raise exception '找不到這個群組';
  end if;
  if not exists (select 1 from groups x where x.id = p_gid and x.owner_id = uid) then
    raise exception '只有群組擁有者可以切換加密';
  end if;

  -- 先鎖 profile 再鎖群組（和 totp_set_vault 同順序）
  select p.vault into cur from profiles p where p.id = uid for update;
  select * into g from groups x where x.id = p_gid for update;
  if g.owner_id <> uid then
    raise exception '只有群組擁有者可以切換加密';
  end if;
  if cur is null then
    raise exception '請先到「帳戶設定」設定加密密碼';
  end if;
  if (cur ->> 'check') is distinct from group_set_encrypted.expected_check then
    raise exception '加密設定已在其他裝置變更，請重新整理';
  end if;
  if g.encrypted = p_on then
    return;
  end if;
  if p_on and exists (select 1 from group_members m where m.group_id = p_gid and m.user_id <> uid) then
    raise exception '群組還有其他成員，請先移除成員再開啟加密';
  end if;

  if exists (select 1 from totp_accounts a where a.group_id = p_gid and not (s ? a.id::text)) then
    raise exception '驗證碼清單已在其他裝置變更，請重新整理後再試';
  end if;
  if exists (
    select 1 from totp_accounts a
    where a.group_id = p_gid
      and (jsonb_typeof(s -> a.id::text) <> 'string' or p_on <> ((s ->> a.id::text) like 'enc:v1:%'))
  ) then
    raise exception '金鑰格式和加密設定不一致，請重新整理後再試';
  end if;

  update totp_secrets t
  set secret = s ->> a.id::text
  from totp_accounts a
  where a.id = t.account_id and a.group_id = p_gid;
  update groups x set encrypted = p_on where x.id = p_gid;

  if p_on then
    update group_invites i set revoked_at = coalesce(i.revoked_at, now()) where i.group_id = p_gid;
    delete from group_email_invites e where e.group_id = p_gid;
  end if;

  perform audit(p_gid, uid, case when p_on then 'group.encryption.enable' else 'group.encryption.disable' end,
                'group', p_gid::text, jsonb_build_object('name', g.name));
  -- 通知其他成員（開啟時只剩擁有者，所以實際上只有關閉後才可能有人）
  perform notify(array(select m.user_id from group_members m where m.group_id = p_gid), 'group_encryption_changed',
                 '群組加密已變更',
                 format('%s %s了「%s」的加密。', notify_name(uid), case when p_on then '開啟' else '關閉' end, g.name),
                 '/groups/' || p_gid::text, jsonb_build_object('group_id', p_gid, 'actor_id', uid, 'encrypted', p_on));
end;
$$;


-- ============================================================
-- 10. 邀請（加密的群組不能邀請、加入、接受邀請；被封鎖的人不能被邀請、加入、接受邀請）
-- ============================================================

-- 邀請連結是否有效：null = 有效，否則 'revoked' / 'expired' / 'used_up'
create function public.invite_invalid_reason(i group_invites)
returns text
language sql
stable
as $$
  select case
    when i.revoked_at is not null then 'revoked'
    when i.expires_at is not null and i.expires_at <= now() then 'expired'
    when i.max_uses is not null and i.uses >= i.max_uses then 'used_up'
  end;
$$;

-- 邀請碼：12 bytes 安全亂數 → 16 碼 URL 安全 base64（96 bit），不重複
create function public.new_invite_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  b bytea;
  c text;
begin
  loop
    begin
      b := extensions.gen_random_bytes(12);
    exception when undefined_function or invalid_schema_name then
      -- 沒有 pgcrypto：gen_random_uuid（pg_strong_random）前 6 bytes 都是亂數，兩個湊成 96 bit
      b := substring(uuid_send(gen_random_uuid()) from 1 for 6) || substring(uuid_send(gen_random_uuid()) from 1 for 6);
    end;
    c := translate(encode(b, 'base64'), '+/=', '-_');
    exit when not exists (select 1 from group_invites where code = c);
  end loop;
  return c;
end;
$$;

-- 加密的群組不能邀請其他人加入；不論有沒有加密都共享鎖住群組列
create function public.group_assert_not_encrypted(p_gid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  enc boolean;
begin
  -- 不論有沒有加密都先共享鎖住群組列：和 group_set_encrypted（開啟加密時會檢查成員、撤銷邀請）、
  -- group_ban（封鎖時會移出成員）互斥
  select g.encrypted into enc from groups g where g.id = p_gid for share;
  if coalesce(enc, false) then
    raise exception '加密的群組不能邀請其他人加入';
  end if;
end;
$$;

-- 建立邀請連結（CREATE_INVITE）：沒給有效時間預設 7 天，最長 30 天；null max_uses = 不限次數；回傳邀請碼
create function public.group_invite_create(gid uuid, expires_in_hours int, max_uses int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_invite_create.gid;
  p_hours int := coalesce(group_invite_create.expires_in_hours, 168);
  p_max int := group_invite_create.max_uses;
  c text;
begin
  perform group_require(p_gid, uid, 16);
  perform group_assert_not_encrypted(p_gid);
  if p_hours <= 0 then
    raise exception '有效時間必須大於 0';
  end if;
  if p_hours > 720 then
    raise exception '有效時間最長 30 天';
  end if;
  if p_max is not null and p_max <= 0 then
    raise exception '使用次數必須大於 0';
  end if;
  c := new_invite_code();
  insert into group_invites (code, group_id, created_by, expires_at, max_uses)
  values (c, p_gid, uid, now() + make_interval(hours => p_hours), p_max);
  perform audit(p_gid, uid, 'group.invite.create', 'invite', c,
                jsonb_build_object('name', c, 'expires_in_hours', p_hours, 'max_uses', p_max));
  return c;
end;
$$;

-- 撤銷邀請連結（建立者，或 MANAGE_GROUP）
create function public.group_invite_revoke(code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  i group_invites%rowtype;
begin
  select * into i from group_invites x where x.code = group_invite_revoke.code;
  if i.code is null then
    raise exception '找不到這個邀請連結';
  end if;
  if i.created_by is distinct from uid then
    perform group_require(i.group_id, uid, 128);
  else
    perform group_require(i.group_id, uid, 0);
  end if;
  update group_invites x set revoked_at = coalesce(x.revoked_at, now()) where x.code = i.code;
  perform audit(i.group_id, uid, 'group.invite.revoke', 'invite', i.code, jsonb_build_object('name', i.code));
end;
$$;

-- 邀請連結資訊（登入）：{ valid, reason, group, inviter, already_member, banned }（banned = 呼叫者被這個群組封鎖）
-- 邀請者 email 只給有全站 VIEW_USERS、或在該群組看得到成員 email 的人
create function public.group_invite_info(code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  i group_invites%rowtype;
  reason text;
begin
  select * into i from group_invites x where x.code = trim(group_invite_info.code);
  if i.code is null then
    return jsonb_build_object('valid', false, 'reason', 'not_found', 'group', null, 'inviter', null, 'already_member', false,
                              'banned', false);
  end if;
  reason := invite_invalid_reason(i);
  return jsonb_build_object(
    'valid', reason is null,
    'reason', reason,
    'group', group_brief(i.group_id),
    'inviter', user_brief(i.created_by, site_permissions(uid) & 4 <> 0 or group_sees_emails(i.group_id, uid)),
    'already_member', group_is_member(i.group_id, uid),
    'banned', group_is_banned(i.group_id, uid)
  );
end;
$$;

-- 用邀請連結加入群組（登入）：已是成員直接回傳 id 不扣次數；被封鎖就 raise；成功時 uses + 1
create function public.group_join(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  i group_invites%rowtype;
  reason text;
begin
  select * into i from group_invites x where x.code = trim(group_join.code);
  if i.code is null then
    raise exception '找不到這個邀請連結';
  end if;
  if group_is_member(i.group_id, uid) then
    return i.group_id;
  end if;
  -- 鎖的順序：先共享鎖群組列、再鎖邀請連結（和 group_ban、group_set_encrypted 同順序，避免互相卡住）
  perform group_assert_not_encrypted(i.group_id);
  select * into i from group_invites x where x.code = i.code for update;
  if group_is_banned(i.group_id, uid) then
    raise exception '你已被這個群組封鎖，無法加入';
  end if;
  reason := invite_invalid_reason(i);
  if reason = 'revoked' then
    raise exception '這個邀請連結已被撤銷';
  elsif reason = 'expired' then
    raise exception '這個邀請連結已過期';
  elsif reason = 'used_up' then
    raise exception '這個邀請連結的使用次數已用完';
  end if;

  insert into group_members (group_id, user_id) values (i.group_id, uid) on conflict do nothing;
  update group_invites x set uses = x.uses + 1 where x.code = i.code;
  delete from group_email_invites e where e.group_id = i.group_id and e.email = user_email(uid);
  perform audit(i.group_id, uid, 'group.member.join', 'member', uid::text, jsonb_build_object('name', display_name(uid), 'code', i.code));
  -- 通知邀請連結的建立者
  perform notify(array[i.created_by], 'invite_answered', '邀請已回覆',
                 format('%s 透過你的邀請連結加入了「%s」。', notify_name(uid), (select g.name from groups g where g.id = i.group_id)),
                 '/groups/' || i.group_id::text,
                 jsonb_build_object('group_id', i.group_id, 'actor_id', uid, 'accepted', true, 'via', 'link'));
  return i.group_id;
end;
$$;

-- 用 Email 或 @ID 邀請（CREATE_INVITE）：@ID 找不到 → raise；email 可以是還沒註冊的人；已邀請過不重複新增；
-- 對方被這個群組封鎖 → raise
create function public.group_invite_user(gid uuid, target text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_invite_user.gid;
  t text := trim(coalesce(group_invite_user.target, ''));
  e text;
  target_uid uuid;
  via text;
  new_id uuid;
begin
  perform group_require(p_gid, uid, 16);
  perform group_assert_not_encrypted(p_gid);
  if t = '' then
    raise exception '請輸入 Email 或 @ID';
  end if;

  if t like '@%' or position('@' in t) = 0 then
    via := 'username';
    select p.id into target_uid from profiles p where p.username = username_normalize(t);
    if target_uid is null then
      raise exception '找不到這個 @ID';
    end if;
    e := user_email(target_uid);
    if e is null then
      raise exception '這位使用者沒有 Email，無法邀請';
    end if;
  else
    via := 'email';
    e := lower(t);
    if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'Email 格式不正確';
    end if;
  end if;

  if exists (
    select 1 from group_members m
    where m.group_id = p_gid and (m.user_id = target_uid or user_email(m.user_id) = e)
  ) then
    raise exception '對方已經是群組成員';
  end if;
  if exists (
    select 1 from group_bans b
    where b.group_id = p_gid and (b.user_id = target_uid or user_email(b.user_id) = e)
  ) then
    raise exception '這位使用者已被這個群組封鎖';
  end if;

  insert into group_email_invites (group_id, email, invited_by)
  values (p_gid, e, uid)
  on conflict (group_id, email) do nothing
  returning id into new_id;
  if new_id is not null then
    perform audit(p_gid, uid, 'group.invite.email', 'invite', new_id::text,
                  jsonb_build_object('name', case when via = 'username' then '@' || username_normalize(t) else e end,
                                     'email', e, 'via', via));
    -- 通知被邀請的人（email 已驗證、對得上的使用者；還沒註冊就沒有人）
    perform notify(
      array(select x.id
            from (select u.id from auth.users u where lower(u.email) = e
                  union
                  select p.id from profiles p where lower(p.email) = e) x
            where user_email(x.id) = e),
      'group_invite', '群組邀請',
      format('%s 邀請你加入「%s」。', notify_name(uid), (select g.name from groups g where g.id = p_gid)),
      '/groups', jsonb_build_object('group_id', p_gid, 'actor_id', uid, 'invite_id', new_id));
  end if;
end;
$$;

-- 取消 Email / @ID 邀請（邀請者，或 CREATE_INVITE）
create function public.group_email_invite_cancel(invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  i group_email_invites%rowtype;
begin
  select * into i from group_email_invites x where x.id = group_email_invite_cancel.invite_id;
  if i.id is null then
    raise exception '找不到這個邀請';
  end if;
  if i.invited_by is distinct from uid then
    perform group_require(i.group_id, uid, 16);
  else
    perform group_require(i.group_id, uid, 0);
  end if;
  delete from group_email_invites x where x.id = i.id;
  perform audit(i.group_id, uid, 'group.invite.revoke', 'invite', i.id::text,
                jsonb_build_object('name', i.email, 'email', i.email));
end;
$$;

-- 我收到的 Email / @ID 邀請（比對已驗證的 email，小寫）
create function public.my_invitations()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  e text := user_email(uid);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id, 'group', group_brief(i.group_id),
      'invited_by', user_brief(i.invited_by, site_permissions(uid) & 4 <> 0),
      'created_at', i.created_at
    ) order by i.created_at desc)
    from group_email_invites i
    where i.email = e
  ), '[]'::jsonb);
end;
$$;

-- 回覆邀請（被邀請者本人）：接受回傳群組 id，拒絕回傳 null；兩者都刪除邀請（群組已加密、被封鎖時不能加入）
create function public.respond_invitation(invite_id uuid, accept boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  i group_email_invites%rowtype;
begin
  select * into i from group_email_invites x where x.id = respond_invitation.invite_id;
  if i.id is null or i.email is distinct from user_email(uid) then
    raise exception '找不到這個邀請';
  end if;
  -- 接受：先共享鎖群組列再刪邀請（和 group_ban 同順序）；加密或被封鎖時 raise，邀請保留
  -- （封鎖時已刪除寄給他的邀請，這裡只會遇到封鎖之後才直接寫進來的邀請）
  if coalesce(respond_invitation.accept, false) and not group_is_member(i.group_id, uid) then
    perform group_assert_not_encrypted(i.group_id);
    if group_is_banned(i.group_id, uid) then
      raise exception '你已被這個群組封鎖，無法加入';
    end if;
  end if;
  delete from group_email_invites x where x.id = i.id;
  if not coalesce(respond_invitation.accept, false) then
    -- 通知邀請者：拒絕了
    perform notify(array[i.invited_by], 'invite_answered', '邀請已回覆',
                   format('%s 拒絕了你加入「%s」的邀請。', notify_name(uid), (select g.name from groups g where g.id = i.group_id)),
                   '/groups/' || i.group_id::text,
                   jsonb_build_object('group_id', i.group_id, 'actor_id', uid, 'accepted', false, 'via', 'email'));
    return null;
  end if;
  if not group_is_member(i.group_id, uid) then
    insert into group_members (group_id, user_id) values (i.group_id, uid) on conflict do nothing;
    perform audit(i.group_id, uid, 'group.member.join', 'member', uid::text,
                  jsonb_build_object('name', display_name(uid), 'via', 'email', 'invited_by', i.invited_by));
    -- 通知邀請者：接受了
    perform notify(array[i.invited_by], 'invite_answered', '邀請已回覆',
                   format('%s 接受了你的邀請，已加入「%s」。', notify_name(uid), (select g.name from groups g where g.id = i.group_id)),
                   '/groups/' || i.group_id::text,
                   jsonb_build_object('group_id', i.group_id, 'actor_id', uid, 'accepted', true, 'via', 'email'));
  end if;
  return i.group_id;
end;
$$;


-- ============================================================
-- 11. 後台
-- ============================================================

-- AdminUser：{ id, email, name, username, photo_url, creation_time, last_login_*, last_active_at, role_ids, top_position,
-- is_owner, totp_count, vault_enabled }
-- last_login_ip 只給自己、管得到對方的人（或 service role）；totp_count 是預設群組的驗證碼數；
-- last_active_at 是所有登入中 session 的最後活動取最新的（同 user_sessions_json），沒有 session 時 null
create function public.admin_user_json(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'email', coalesce(u.email, p.email),
    'name', p.name,
    'username', p.username,
    'photo_url', p.photo_url,
    'creation_time', coalesce(nullif(p.creation_time, ''), u.created_at::text),
    'last_login_at', p.last_login_at,
    'last_login_ip', case
      when auth.uid() is null or auth.uid() = p.id or site_can_manage_user(auth.uid(), p.id) then p.last_login_ip
    end,
    'last_login_device', p.last_login_device,
    'last_active_at', (
      select max(case when d.session_id is null then greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'UTC') else d.last_seen_at end)
      from auth.sessions s
      left join public.session_devices d on d.session_id = s.id and d.user_id = s.user_id
      where s.user_id = p.id
        and (s.not_after is null or s.not_after > now())
    ),
    'role_ids', coalesce((
      select jsonb_agg(ur.role_id order by r.position desc)
      from site_user_roles ur join site_roles r on r.id = ur.role_id
      where ur.user_id = p.id and not r.is_default
    ), '[]'::jsonb),
    'top_position', site_top_position(p.id),
    'is_owner', site_is_owner(p.id),
    'totp_count', (select count(*) from totp_accounts a where a.group_id = default_group_of(p.id)),
    'vault_enabled', p.vault is not null
  )
  from profiles p
  left join auth.users u on u.id = p.id
  where p.id = p_uid;
$$;

-- 使用者列表（VIEW_USERS）：{ total, users, site_owner_id }；search 比對 email / name / username；依建立時間新到舊
create function public.admin_users(search text, page_offset int, page_size int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  s text := nullif(trim(coalesce(admin_users.search, '')), '');
  pat text;
  total bigint;
  users jsonb;
begin
  perform site_require(uid, 4);
  pat := '%' || replace(replace(replace(coalesce(s, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with matched as (
    select p.id, u.created_at as created
    from profiles p
    left join auth.users u on u.id = p.id
    where s is null
       or coalesce(u.email, p.email, '') ilike pat
       or coalesce(p.name, '') ilike pat
       or coalesce(p.username, '') ilike pat
  )
  select (select count(*) from matched),
         coalesce((
           select jsonb_agg(admin_user_json(m.id) order by m.created desc nulls last, m.id)
           from (
             select * from matched
             order by created desc nulls last, id
             offset greatest(coalesce(admin_users.page_offset, 0), 0)
             limit greatest(1, least(coalesce(admin_users.page_size, 50), 200))
           ) m
         ), '[]'::jsonb)
  into total, users;

  return jsonb_build_object('total', total, 'users', users,
                            'site_owner_id', (select o.user_id from site_owner o limit 1));
end;
$$;

-- 使用者詳情（VIEW_USERS）：AdminUser 加 groups: [{ id, name, is_owner }]
create function public.admin_user(user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_target uuid := admin_user.user_id;
  j jsonb;
begin
  perform site_require(uid, 4);
  j := admin_user_json(p_target);
  if j is null then
    raise exception '找不到這位使用者';
  end if;
  return j || jsonb_build_object('groups', coalesce((
    select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'is_owner', g.owner_id = p_target)
                     order by m.joined_at)
    from group_members m join groups g on g.id = m.group_id
    where m.user_id = p_target
  ), '[]'::jsonb));
end;
$$;

-- 修改使用者名稱與 @ID（MANAGE_USERS + 階層）：null 代表不改，空字串代表清除 @ID；名稱最多 64 字
create function public.admin_update_user(user_id uuid, name text, username text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_target uuid := admin_update_user.user_id;
  p_name text := trim(admin_update_user.name);
  p_username text := admin_update_user.username;
  v text;
  old profiles%rowtype;
begin
  perform site_require(uid, 8);
  select * into old from profiles where id = p_target;
  if old.id is null then
    raise exception '找不到這位使用者';
  end if;
  if p_target <> uid and not site_can_manage_user(uid, p_target) then
    raise exception '只能管理比你目前最高身分組還低的身分組 / 成員';
  end if;
  if char_length(p_name) > 64 then
    raise exception '名稱最多 64 個字';
  end if;

  if p_username is not null then
    v := username_normalize(p_username);
    if v is not null then
      perform username_assert(v, p_target);
    end if;
  end if;

  begin
    update profiles p
    set name = case when p_name is null then p.name else p_name end,
        username = case when p_username is null then p.username else v end,
        updated_at = now()
    where p.id = p_target;
  exception when unique_violation then
    raise exception '這個 @ID 已被使用';
  end;

  perform audit(null, uid, 'site.user.update', 'user', p_target::text, jsonb_build_object(
    'name', coalesce(nullif(case when p_name is null then old.name else p_name end, ''), display_name(p_target)),
    'old_name', old.name,
    'username', case when p_username is null then old.username else v end, 'old_username', old.username));
  -- @ID 被改了：通知本人（後台可以整個關掉；改自己的不通知）
  if p_username is not null and v is distinct from old.username and p_target <> uid
     and notify_admin_change_enabled('username') then
    perform notify(array[p_target], 'admin_changed_username', '@ID 已被修改',
                   case when v is null then format('%s 清除了你的 @ID。', notify_name(uid))
                        else format('%s 把你的 @ID 改成 @%s。', notify_name(uid), v) end,
                   '/me/update_info', jsonb_build_object('actor_id', uid, 'username', v, 'old_username', old.username));
  end if;
end;
$$;

-- 使用者預設群組的 2FA（VIEW_USER_TOTP + 階層）：已加密（enc:v1:）的 secret 是 null、encrypted true；記錄 site.user.totp.view
create function public.admin_user_totp(user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_target uuid := admin_user_totp.user_id;
  result jsonb;
begin
  perform site_require(uid, 16);
  if not exists (select 1 from profiles where id = p_target) then
    raise exception '找不到這位使用者';
  end if;
  if p_target <> uid and not site_can_manage_user(uid, p_target) then
    raise exception '只能管理比你目前最高身分組還低的身分組 / 成員';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'name', a.name, 'category', a.category, 'digits', a.digits, 'period', a.period,
    'algorithm', a.algorithm, 'pinned', a.pinned,
    'secret', case when coalesce(s.secret, '') like 'enc:v1:%' then null else coalesce(s.secret, '') end,
    'encrypted', coalesce(s.secret, '') like 'enc:v1:%'
  ) order by a.position, a.created_at, a.id), '[]'::jsonb)
  into result
  from totp_accounts a
  left join totp_secrets s on s.account_id = a.id
  where a.group_id = default_group_of(p_target);
  perform audit(null, uid, 'site.user.totp.view', 'user', p_target::text,
                jsonb_build_object('name', display_name(p_target), 'count', jsonb_array_length(result)));
  return result;
end;
$$;

-- 修改使用者預設群組的一筆 2FA（MANAGE_USER_TOTP + 階層）：patch 同 totp_update；預設群組已加密時不能改 secret
create function public.admin_update_user_totp(user_id uuid, item_id uuid, patch jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_target uuid := admin_update_user_totp.user_id;
  p_item uuid := admin_update_user_totp.item_id;
  p_patch jsonb := admin_update_user_totp.patch;
  gid uuid := default_group_of(admin_update_user_totp.user_id);
  fields jsonb;
begin
  perform site_require(uid, 32);
  if gid is null or not exists (select 1 from totp_accounts a where a.id = p_item and a.group_id = gid) then
    raise exception '找不到這筆驗證碼';
  end if;
  if p_target <> uid and not site_can_manage_user(uid, p_target) then
    raise exception '只能管理比你目前最高身分組還低的身分組 / 成員';
  end if;
  if jsonb_typeof(p_patch) = 'object' and p_patch ? 'secret' then
    if exists (select 1 from groups g where g.id = gid and g.encrypted) then
      raise exception '這位使用者的預設群組已加密，無法修改金鑰';
    end if;
    perform group_assert_secret_format(gid, array[coalesce(p_patch ->> 'secret', '')]);
  end if;
  perform totp_apply_patch(p_item, p_patch);
  select coalesce(jsonb_agg(k), '[]'::jsonb) into fields
  from jsonb_object_keys(case when jsonb_typeof(p_patch) = 'object' then p_patch else '{}'::jsonb end) k
  where k in ('name', 'category', 'secret', 'digits', 'period', 'algorithm', 'pinned');
  perform audit(null, uid, 'site.user.totp.update', 'user', p_target::text, jsonb_build_object(
    'name', display_name(p_target), 'item_id', p_item,
    'item_name', (select name from totp_accounts where id = p_item), 'fields', fields));
  -- 通知本人（後台可以整個關掉；改自己的不通知）
  if p_target <> uid and notify_admin_change_enabled('codes') then
    perform notify(array[p_target], 'admin_changed_codes', '驗證碼已被修改',
                   format('%s 修改了你的驗證碼「%s」。', notify_name(uid), (select name from totp_accounts where id = p_item)),
                   '/', jsonb_build_object('actor_id', uid, 'item_id', p_item, 'action', 'update'));
  end if;
end;
$$;

-- 刪除使用者預設群組的一筆 2FA（MANAGE_USER_TOTP + 階層）
create function public.admin_delete_user_totp(user_id uuid, item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_target uuid := admin_delete_user_totp.user_id;
  p_item uuid := admin_delete_user_totp.item_id;
  a totp_accounts%rowtype;
begin
  perform site_require(uid, 32);
  select * into a from totp_accounts x where x.id = p_item and x.group_id = default_group_of(p_target);
  if a.id is null then
    raise exception '找不到這筆驗證碼';
  end if;
  if p_target <> uid and not site_can_manage_user(uid, p_target) then
    raise exception '只能管理比你目前最高身分組還低的身分組 / 成員';
  end if;
  delete from totp_accounts x where x.id = p_item;
  perform audit(null, uid, 'site.user.totp.delete', 'user', p_target::text,
                jsonb_build_object('name', display_name(p_target), 'item_id', p_item, 'item_name', a.name));
  -- 通知本人（後台可以整個關掉；改自己的不通知）
  if p_target <> uid and notify_admin_change_enabled('codes') then
    perform notify(array[p_target], 'admin_changed_codes', '驗證碼已被修改',
                   format('%s 刪除了你的驗證碼「%s」。', notify_name(uid), a.name),
                   '/', jsonb_build_object('actor_id', uid, 'item_id', p_item, 'action', 'delete'));
  end if;
end;
$$;

-- 能不能刪除這位使用者（給 /api/admin/delete-user 用）：
-- MANAGE_USERS + 階層 + 不是自己 + 不是最後一位管理員 + 沒有擁有「有其他成員」的群組；不通過時 raise 說明原因
create function public.admin_can_delete_user(user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_target uuid := admin_can_delete_user.user_id;
begin
  perform site_require(uid, 8);
  if not exists (select 1 from profiles where id = p_target) then
    raise exception '找不到這位使用者';
  end if;
  if p_target = uid then
    raise exception '不能刪除自己的帳號（請到個人設定刪除帳號）';
  end if;
  if not site_can_manage_user(uid, p_target) then
    raise exception '只能管理比你目前最高身分組還低的身分組 / 成員';
  end if;
  if site_permissions(p_target) & 1 <> 0 and site_admin_count() <= 1 then
    raise exception '至少要保留一位擁有「管理員」權限的使用者';
  end if;
  if exists (
    select 1 from groups g
    where g.owner_id = p_target
      and exists (select 1 from group_members m where m.group_id = g.id and m.user_id <> p_target)
  ) then
    raise exception '這位使用者還擁有有其他成員的群組，請先轉移擁有權或刪除群組';
  end if;
  return true;
end;
$$;

-- 使用者自己刪除帳戶前檢查：還擁有有其他成員的群組、或是全站最後一位管理員 → raise；否則回傳 true
create function public.can_delete_self()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  n bigint;
begin
  select count(*) into n from groups g
  where g.owner_id = uid
    and exists (select 1 from group_members m where m.group_id = g.id and m.user_id <> uid);
  if n > 0 then
    raise exception '你還是 % 個有其他成員的群組的擁有者，請先轉移擁有權或刪除群組', n;
  end if;
  if site_permissions(uid) & 1 <> 0 and site_admin_count() <= 1 then
    raise exception '你是最後一位管理員，請先把管理員身分組指派給其他人';
  end if;
  return true;
end;
$$;

-- 所有群組（MANAGE_GROUPS）：[{ id, name, description, owner, member_count, account_count, created_at }]
create function public.admin_groups(search text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  s text := nullif(trim(coalesce(admin_groups.search, '')), '');
  pat text;
begin
  perform site_require(uid, 512);
  pat := '%' || replace(replace(replace(coalesce(s, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', g.id, 'name', g.name, 'description', g.description,
      'owner', user_brief(g.owner_id, site_permissions(uid) & 4 <> 0),
      'member_count', (select count(*) from group_members m where m.group_id = g.id),
      'account_count', (select count(*) from totp_accounts a where a.group_id = g.id),
      'created_at', g.created_at
    ) order by g.created_at desc)
    from groups g
    where s is null or g.name ilike pat or g.description ilike pat
  ), '[]'::jsonb);
end;
$$;


-- ============================================================
-- 12. 稽核紀錄與登入紀錄
-- 帳號操作紀錄由資料庫觸發器 / RPC 寫入，不靠前端：
-- - profiles 觸發器：@ID、名稱、大頭照、背景圖、電話、email（auth 同步）、金鑰加密（啟用 / 改密碼 / 停用 / 忘記密碼重設）、
--   預設群組的變更（舊值 → 新值）；操作者是 auth.uid()，service role / 觸發器裡沒有 uid 時記 null（系統）
-- - 管理員從後台改名稱 / @ID 已由 admin_update_user 記 site.user.update（含舊值新值），觸發器不重複記
-- - 全站身分組：site_set_user_roles 記 site.user.roles；登入時自動套用的 pending 身分組也記一筆（操作者 null = 系統）
-- - 群組相關的沿用群組紀錄：加入 / 被加入 / 離開 / 被移出（target_type 'member'、target_id = 使用者）、
--   自己切換群組加密（group.encryption.*，操作者 = 使用者）
-- 查詢分頁：before_id = 上一頁最後一筆的 id；管不到的人（階層不比對方高，最高位持有者例外）的 IP 是 null。
-- ============================================================

-- 操作紀錄分頁：[{ id, actor, action, target_type, target_id, detail, created_at }]，id 由大到小。
-- p_gid 是群組：那個群組的紀錄；p_site_views false 時不列網站管理員靠網站權限查看的（detail.via_site）。
-- p_gid 是 null：全站的紀錄；p_site_views true 時另外列出各群組裡 via_site 的紀錄，並附上 group { id, name }
create function public.audit_page(p_gid uuid, p_before bigint, p_size int, p_with_email boolean, p_site_views boolean)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', l.id, 'actor', user_brief(l.actor_id, p_with_email), 'action', l.action,
      'target_type', l.target_type, 'target_id', l.target_id, 'detail', l.detail, 'created_at', l.created_at
    ) || case when p_gid is null and l.group_id is not null
              then jsonb_build_object('group', (select jsonb_build_object('id', g.id, 'name', g.name) from groups g where g.id = l.group_id))
              else '{}'::jsonb end
    order by l.id desc), '[]'::jsonb)
  from (
    select * from audit_logs
    where (p_before is null or id < p_before)
      and case when p_gid is null
               then group_id is null or (p_site_views and detail ? 'via_site')
               else group_id = p_gid and (p_site_views or not detail ? 'via_site') end
    order by id desc
    limit greatest(1, least(coalesce(p_size, 50), 200))
  ) l;
$$;

-- 邀請碼只留前 4 碼：'AbCdEfGh…' → 'AbCd…'
create function public.invite_code_mask(v text)
returns text
language sql
immutable
as $$
  select case when v is null or char_length(v) <= 4 then v else left(v, 4) || '…' end;
$$;

-- 群組操作紀錄的一筆（audit_page 的格式）讀取時遮蔽：邀請連結的邀請碼（target_id、detail.name、detail.code）只留前 4 碼；
-- p_with_email false 時 detail 裡看起來像 email 的 name / actor_name / email 改成 null。存的資料不變
create function public.group_audit_redact(p_row jsonb, p_with_email boolean)
returns jsonb
language plpgsql
immutable
as $$
declare
  r jsonb := p_row;
  d jsonb := case when jsonb_typeof(p_row -> 'detail') = 'object' then p_row -> 'detail' else '{}'::jsonb end;
  k text;
begin
  if p_row is null then
    return null;
  end if;
  -- 邀請連結的紀錄：target_id 與 detail.name 是邀請碼（Email 邀請的 target_id 是 uuid，不是邀請碼）
  if coalesce(p_row ->> 'action', '') like 'group.invite.%'
     and (p_row ->> 'target_type') = 'invite'
     and coalesce(p_row ->> 'target_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    r := r || jsonb_build_object('target_id', invite_code_mask(p_row ->> 'target_id'));
    if jsonb_typeof(d -> 'name') = 'string' then
      d := d || jsonb_build_object('name', invite_code_mask(d ->> 'name'));
    end if;
  end if;
  -- 用邀請連結加入（group.member.join）的 detail.code
  if jsonb_typeof(d -> 'code') = 'string' then
    d := d || jsonb_build_object('code', invite_code_mask(d ->> 'code'));
  end if;
  -- 看不到 email 的人：detail 裡看起來像 email 的值（Email 邀請、沒有名稱時用 email 當顯示名稱）改成 null
  if not coalesce(p_with_email, false) then
    foreach k in array array['name', 'actor_name', 'email'] loop
      if jsonb_typeof(d -> k) = 'string' and (d ->> k) ~ '^[^@\s]+@[^@\s]+$' then
        d := d || jsonb_build_object(k, null);
      end if;
    end loop;
  end if;
  return r || jsonb_build_object('detail', d);
end;
$$;

-- 群組操作紀錄（VIEW_AUDIT_LOG）：id 由大到小，before_id null 從最新開始；
-- email 只給看得到成員 email 的人（group_sees_emails），邀請碼一律遮蔽（group_audit_redact）；
-- 網站管理員靠網站權限查看金鑰的紀錄（via_site）只有網站的「查看操作紀錄」看得到
create function public.group_audit_log(gid uuid, before_id bigint, page_size int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_audit_log.gid;
  with_email boolean;
begin
  perform group_require(p_gid, uid, 256);
  with_email := group_sees_emails(p_gid, uid);
  return coalesce((
    select jsonb_agg(group_audit_redact(x.e, with_email) order by x.ord)
    from jsonb_array_elements(audit_page(p_gid, group_audit_log.before_id, group_audit_log.page_size, with_email,
                                         site_permissions(uid) & 128 <> 0))
         with ordinality as x(e, ord)
  ), '[]'::jsonb);
end;
$$;

-- 全站操作紀錄（VIEW_AUDIT_LOG）：group_id null 的紀錄，加上網站管理員在各群組靠網站權限查看金鑰的紀錄
create function public.admin_audit_log(before_id bigint, page_size int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
begin
  perform site_require(uid, 128);
  return audit_page(null, admin_audit_log.before_id, admin_audit_log.page_size, site_permissions(uid) & 4 <> 0, true);
end;
$$;

-- 目前的操作者：auth.uid()，沒有 profile（或沒有 uid，例如 service role / auth 觸發器）時 null = 系統
create function public.activity_actor()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id from profiles p where p.id = auth.uid();
$$;

-- 寫一筆「跟這位使用者有關」的紀錄（全站、target_type 'user'）；detail 一定帶 name（使用者顯示名稱）
create function public.user_audit(p_target uuid, p_actor uuid, p_action text, p_detail jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into audit_logs (group_id, actor_id, action, target_type, target_id, detail)
  values (
    null,
    (select p.id from profiles p where p.id = p_actor),
    p_action,
    'user',
    p_target::text,
    jsonb_build_object('name', coalesce(display_name(p_target), p_target::text)) || coalesce(p_detail, '{}'::jsonb)
  );
$$;

-- 舊值 / 新值：空字串當成沒有，過長的（例如圖片網址）截斷
create function public.activity_value(v text)
returns text
language sql
immutable
as $$
  select left(nullif(v, ''), 512);
$$;

-- 使用者的操作紀錄分頁：[{ id, actor, action, target_type, target_id, detail, group, created_at }]，id 由大到小；
-- page_size 預設 20、上限 100。
-- site.user.roles 的 detail 另外附上 added_names / removed_names（身分組目前的名稱；已刪除的身分組不列）。
-- p_admin false（使用者看自己的）時不列管理員查看他的 2FA（site.user.totp.view），只有後台看得到
create function public.user_activity_page(p_uid uuid, p_before bigint, p_size int, p_with_email boolean, p_admin boolean)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', l.id,
      'actor', user_brief(l.actor_id, p_with_email),
      'action', l.action,
      'target_type', l.target_type,
      'target_id', l.target_id,
      'detail', l.detail || case when l.action = 'site.user.roles' then jsonb_build_object(
        'added_names', (
          select coalesce(jsonb_agg(r.name order by r.position desc), '[]'::jsonb) from site_roles r
          where jsonb_typeof(l.detail -> 'added') = 'array'
            and r.id::text in (select jsonb_array_elements_text(l.detail -> 'added'))
        ),
        'removed_names', (
          select coalesce(jsonb_agg(r.name order by r.position desc), '[]'::jsonb) from site_roles r
          where jsonb_typeof(l.detail -> 'removed') = 'array'
            and r.id::text in (select jsonb_array_elements_text(l.detail -> 'removed'))
        )
      ) else '{}'::jsonb end,
      'group', (select jsonb_build_object('id', g.id, 'name', g.name) from groups g where g.id = l.group_id),
      'created_at', l.created_at
    ) order by l.id desc), '[]'::jsonb)
  from (
    select * from audit_logs a
    where (p_before is null or a.id < p_before)
      and (p_admin or a.action <> 'site.user.totp.view')
      and (
        (a.target_type = 'user' and a.target_id = p_uid::text and a.action <> 'site.user.delete')
        or (a.target_type = 'member' and a.target_id = p_uid::text
            and a.action in ('group.member.join', 'group.member.add', 'group.member.leave', 'group.member.kick'))
        or (a.actor_id = p_uid and a.action in ('group.encryption.enable', 'group.encryption.disable'))
      )
    order by a.id desc
    limit greatest(1, least(coalesce(p_size, 20), 100))
  ) l;
$$;

-- 保留期限（只給 service role，/api/record-login 寫入登入紀錄時呼叫）：
-- 刪掉一年前的登入紀錄（所有人，包含已刪除的帳號）、帳號刪除超過一年的託管密文、一年前的通知
create function public.prune_retention()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from login_history h where h.created_at < now() - interval '1 year';
  delete from vault_escrow v where v.account_deleted_at < now() - interval '1 year';
  delete from notifications n where n.created_at < now() - interval '1 year';
end;
$$;

-- 使用者的登入紀錄分頁：[{ id, created_at, ip, device, user_agent, provider }]，新到舊；p_show_ip false 時 ip 是 null
create function public.login_history_page(p_uid uuid, p_before bigint, p_size int, p_show_ip boolean)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', h.id,
      'created_at', h.created_at,
      'ip', case when p_show_ip then h.ip end,
      'device', h.device,
      'user_agent', h.user_agent,
      'provider', h.provider
    ) order by h.created_at desc, h.id desc), '[]'::jsonb)
  from (
    select * from login_history x
    where x.user_id = p_uid
      and (p_before is null
           or (x.created_at, x.id) < (select y.created_at, y.id from login_history y where y.id = p_before and y.user_id = p_uid))
    order by x.created_at desc, x.id desc
    limit greatest(1, least(coalesce(p_size, 20), 100))
  ) h;
$$;

-- profiles 的變更寫進帳號操作紀錄
create function public.profiles_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := activity_actor();
  -- 管理員從後台改名稱 / @ID（admin_update_user）時已記 site.user.update，這裡不重複記
  -- （profiles 只有本人能直接改，別人的 uid 改到這兩欄只會是後台）
  by_admin boolean := actor is not null and actor <> new.id;
  act text;
begin
  if new.username is distinct from old.username and not by_admin then
    perform user_audit(new.id, actor, 'user.username',
                       jsonb_build_object('old', old.username, 'new', new.username));
  end if;
  if activity_value(new.name) is distinct from activity_value(old.name) and not by_admin then
    perform user_audit(new.id, actor, 'user.name',
                       jsonb_build_object('old', activity_value(old.name), 'new', activity_value(new.name)));
  end if;
  if activity_value(new.photo_url) is distinct from activity_value(old.photo_url) then
    perform user_audit(new.id, actor, 'user.photo',
                       jsonb_build_object('old', activity_value(old.photo_url), 'new', activity_value(new.photo_url)));
  end if;
  if activity_value(new.bg_photo_url) is distinct from activity_value(old.bg_photo_url) then
    perform user_audit(new.id, actor, 'user.background',
                       jsonb_build_object('old', activity_value(old.bg_photo_url), 'new', activity_value(new.bg_photo_url)));
  end if;
  if activity_value(new.phone_number) is distinct from activity_value(old.phone_number) then
    perform user_audit(new.id, actor, 'user.phone',
                       jsonb_build_object('old', activity_value(old.phone_number), 'new', activity_value(new.phone_number)));
  end if;
  -- email 只會從 auth.users 同步過來（ensure_profile），記成系統
  if lower(coalesce(new.email, '')) is distinct from lower(coalesce(old.email, '')) then
    perform user_audit(new.id, null, 'user.email',
                       jsonb_build_object('old', activity_value(old.email), 'new', activity_value(new.email)));
  end if;

  -- 金鑰加密（profiles.vault）
  act := case
    when old.vault is null and new.vault is not null then 'user.vault.enable'
    when old.vault is not null and new.vault is null then
      case when coalesce(current_setting('securibit.vault_reset', true), '') = 'on'
           then 'user.vault.reset' else 'user.vault.disable' end
    when old.vault is not null and (new.vault ->> 'check') is distinct from (old.vault ->> 'check') then 'user.vault.password'
  end;
  if act is not null then
    perform user_audit(new.id, actor, act, '{}'::jsonb);
    -- 通知本人（自己做的也通知）；推播不送到做這個變更的那台裝置
    perform notify(array[new.id], 'vault_changed',
      case act when 'user.vault.enable' then '已設定金鑰加密密碼' when 'user.vault.password' then '金鑰加密密碼已變更'
               when 'user.vault.disable' then '已關閉金鑰加密' else '已重設金鑰加密' end,
      case act when 'user.vault.enable' then '你已設定金鑰加密的密碼。'
               when 'user.vault.password' then '你的金鑰加密密碼已變更。'
               when 'user.vault.disable' then '你已關閉金鑰加密。'
               else '你已重設金鑰加密，加密群組裡的驗證碼已刪除。' end
        || '如果不是你本人操作，請立即檢查帳號安全。',
      '/me/update_info', jsonb_build_object('action', replace(act, 'user.vault.', '')), current_session_id());
  end if;

  -- 預設群組（建立 profile 時第一次設定不算）
  if old.default_group_id is not null and new.default_group_id is distinct from old.default_group_id then
    perform user_audit(new.id, actor, 'user.default_group', jsonb_build_object(
      'old_id', old.default_group_id,
      'old', (select g.name from groups g where g.id = old.default_group_id),
      'new_id', new.default_group_id,
      'new', (select g.name from groups g where g.id = new.default_group_id)));
  end if;

  return null;
end;
$$;

create trigger profiles_activity
  after update on public.profiles
  for each row execute function public.profiles_activity();

-- 自己的登入紀錄
create function public.my_login_history(before_id bigint, page_size int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
begin
  return login_history_page(uid, my_login_history.before_id, my_login_history.page_size, true);
end;
$$;

-- 自己的帳號操作紀錄（操作者不含 email）
create function public.my_account_activity(before_id bigint, page_size int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
begin
  return user_activity_page(uid, my_account_activity.before_id, my_account_activity.page_size, false, false);
end;
$$;

-- 使用者的登入紀錄（VIEW_USERS）；管不到對方（階層不比對方高）時 ip 是 null
create function public.admin_user_login_history(user_id uuid, before_id bigint, page_size int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_target uuid := admin_user_login_history.user_id;
begin
  perform site_require(uid, 4);
  if not exists (select 1 from profiles p where p.id = p_target) then
    raise exception '找不到這位使用者';
  end if;
  return login_history_page(p_target, admin_user_login_history.before_id, admin_user_login_history.page_size,
                            p_target = uid or site_can_manage_user(uid, p_target));
end;
$$;

-- 使用者的帳號操作紀錄（VIEW_USERS）
create function public.admin_user_activity(user_id uuid, before_id bigint, page_size int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_target uuid := admin_user_activity.user_id;
begin
  perform site_require(uid, 4);
  if not exists (select 1 from profiles p where p.id = p_target) then
    raise exception '找不到這位使用者';
  end if;
  return user_activity_page(p_target, admin_user_activity.before_id, admin_user_activity.page_size, true, true);
end;
$$;


-- ============================================================
-- 13. 即時同步（App 用 Supabase Realtime）
-- sync_signals：每位使用者「哪裡變了」的訊號，一列一個 topic，只存時間，不存任何群組或驗證碼的內容：
--   'groups'            群組清單（名稱、說明、擁有者、加密、成員數、驗證碼數、我的權限、我排的順序、預設群組）
--   'invitations'       寄給我（email）的群組邀請
--   'codes:<群組 id>'   這個群組的驗證碼清單與權限（不含金鑰）
--   'secrets:<群組 id>' 這個群組的金鑰
-- App 用 Realtime 訂閱自己的列，收到後照原本的 RPC 重新讀取，解密、權限與排序都照舊。
--
-- 為什麼不直接讓 Realtime 訂閱 groups / group_members / totp_accounts…：
--   那些表開了 RLS、不建 policy，也 revoke 了 authenticated 的 select，讀寫一律走 security definer 的 RPC。
--   Realtime 的 postgres_changes 要訂閱者對資料表有 select 權限、並通過 RLS 才會送事件；為了 Realtime 開放的話，
--   使用者就能用 REST 直接讀這些表，繞過 RPC 裡的權限檢查（例如單筆驗證碼「查看驗證碼」的拒絕覆寫），
--   totp_secrets 更不能開放。所以改由觸發器把變更寫到 sync_signals（扇出給相關的人），只開放這一張表。
--
-- 觸發器（after、for each row、security definer）：
--   groups 修改                            → 全體成員 groups；category_order 修改 → 全體成員 codes（只改它時不送 groups）
--   group_members 新增 / 刪除              → 全體成員與本人 groups（刪除時順便刪掉本人在這個群組的 codes / secrets 列）
--   group_members 修改（自己排順序）       → 本人 groups
--   group_roles 任何變更                   → 全體成員 groups、codes
--   group_member_roles 新增 / 刪除         → 本人 groups、codes
--   totp_accounts 新增 / 刪除              → 全體成員 groups、codes；修改 → 全體成員 codes
--   totp_secrets 任何變更                  → 全體成員 secrets
--   group_account_overwrites 任何變更      → 全體成員 groups、codes
--   group_email_invites 新增 / 刪除        → 被邀請的 email 那位使用者 invitations
--   profiles.default_group_id 變更         → 本人 groups
--   刪除 profile                           → 刪掉本人的全部訊號
-- 群組刪除時 cascade 刪掉成員、身分組、驗證碼，各自的觸發器會通知到。
-- 全站身分組（site_roles / site_user_roles）的變動不通知，App 每 60 秒的輪詢會補上。
--
-- 同一個交易裡同一列只寫一次：changed_at = transaction_timestamp()，已經是這個值就不更新，
-- 批次操作（重新排序、清空、整批匯入、開關加密改寫金鑰）每個人每個 topic 只送一個事件。
-- 不要手動刪 sync_signals 的列：Realtime 的 DELETE 事件不套用 RLS（App 也只訂閱 INSERT / UPDATE），
-- 主鍵用流水號，舊資料只帶 id，不會洩漏 user_id 或 topic。
-- ============================================================

-- ---------- 內部 helper（只給觸發器用）----------

-- 通知 uids 的每一位 × topics 的每一個；已刪除的 profile 不寫（刪帳號的 cascade 途中）
create function public.sync_signal(p_uids uuid[], p_topics text[])
returns void
language sql
security definer
set search_path = public
as $$
  insert into sync_signals as s (user_id, topic, changed_at)
  select distinct u, t, transaction_timestamp()
  from unnest(p_uids) u
  cross join unnest(p_topics) t
  where u is not null and t is not null
    and exists (select 1 from profiles p where p.id = u)
  on conflict (user_id, topic) do update
    set changed_at = excluded.changed_at
    where s.changed_at is distinct from excluded.changed_at;
$$;

-- 這個群組的 topic：'codes' / 'secrets' 帶上群組 id，其他照原樣
create function public.sync_group_topics(p_gid uuid, p_kinds text[])
returns text[]
language sql
immutable
set search_path = public
as $$
  select array(
    select case when k in ('codes', 'secrets') then k || ':' || p_gid::text else k end
    from unnest(p_kinds) k
  );
$$;

-- 通知群組的全體成員
create function public.sync_signal_group(p_gid uuid, p_kinds text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_gid is null then
    return;
  end if;
  perform sync_signal(
    array(select m.user_id from group_members m where m.group_id = p_gid),
    sync_group_topics(p_gid, p_kinds)
  );
end;
$$;

-- ---------- 觸發器 ----------

-- 群組：名稱、說明、擁有者、加密 → 全體成員 groups；類別順序 → 全體成員 codes:<群組 id>
create function public.sync_on_groups()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (to_jsonb(old) - 'category_order') is distinct from (to_jsonb(new) - 'category_order') then
    perform sync_signal_group(new.id, array['groups']);
  end if;
  if old.category_order is distinct from new.category_order then
    perform sync_signal_group(new.id, array['codes']);
  end if;
  return null;
end;
$$;

create trigger sync_signals_groups
  after update on public.groups
  for each row
  when (old.* is distinct from new.*)
  execute function public.sync_on_groups();

-- 成員：加入、離開（成員數、群組出現或消失）；修改只有自己排的順序
create function public.sync_on_group_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform sync_signal_group(new.group_id, array['groups']);
  elsif tg_op = 'UPDATE' then
    perform sync_signal(array[new.user_id], array['groups']);
  else
    perform sync_signal_group(old.group_id, array['groups']);
    perform sync_signal(array[old.user_id], array['groups']);
    delete from sync_signals s
    where s.user_id = old.user_id
      and s.topic in ('codes:' || old.group_id::text, 'secrets:' || old.group_id::text);
  end if;
  return null;
end;
$$;

create trigger sync_signals_group_members
  after insert or delete on public.group_members
  for each row execute function public.sync_on_group_members();

create trigger sync_signals_group_members_update
  after update on public.group_members
  for each row
  when (old.* is distinct from new.*)
  execute function public.sync_on_group_members();

-- 身分組：權限變了，全體成員的群組權限與每筆驗證碼的權限都可能變
create function public.sync_on_group_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
begin
  if tg_op = 'DELETE' then
    gid := old.group_id;
  else
    gid := new.group_id;
  end if;
  perform sync_signal_group(gid, array['groups', 'codes']);
  return null;
end;
$$;

create trigger sync_signals_group_roles
  after insert or update or delete on public.group_roles
  for each row execute function public.sync_on_group_roles();

-- 成員的身分組：只影響這位成員的權限
create function public.sync_on_group_member_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
  member uuid;
begin
  if tg_op = 'DELETE' then
    gid := old.group_id;
    member := old.user_id;
  else
    gid := new.group_id;
    member := new.user_id;
  end if;
  perform sync_signal(array[member], sync_group_topics(gid, array['groups', 'codes']));
  return null;
end;
$$;

create trigger sync_signals_group_member_roles
  after insert or update or delete on public.group_member_roles
  for each row execute function public.sync_on_group_member_roles();

-- 驗證碼（不含金鑰）：新增、刪除也會改到群組清單的驗證碼數；個人驗證碼（group_id 為 null 的舊資料）不通知
create function public.sync_on_totp_accounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform sync_signal_group(new.group_id, array['groups', 'codes']);
  elsif tg_op = 'DELETE' then
    perform sync_signal_group(old.group_id, array['groups', 'codes']);
  elsif old.group_id is distinct from new.group_id then
    perform sync_signal_group(old.group_id, array['groups', 'codes']);
    perform sync_signal_group(new.group_id, array['groups', 'codes']);
  else
    perform sync_signal_group(new.group_id, array['codes']);
  end if;
  return null;
end;
$$;

create trigger sync_signals_totp_accounts
  after insert or delete on public.totp_accounts
  for each row execute function public.sync_on_totp_accounts();

create trigger sync_signals_totp_accounts_update
  after update on public.totp_accounts
  for each row
  when (old.* is distinct from new.*)
  execute function public.sync_on_totp_accounts();

-- 金鑰：刪除驗證碼時 cascade 刪掉的金鑰找不到驗證碼，由 totp_accounts 的觸發器通知
create function public.sync_on_totp_secrets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  aid uuid;
begin
  if tg_op = 'DELETE' then
    aid := old.account_id;
  else
    aid := new.account_id;
  end if;
  perform sync_signal_group((select a.group_id from totp_accounts a where a.id = aid), array['secrets']);
  return null;
end;
$$;

create trigger sync_signals_totp_secrets
  after insert or delete on public.totp_secrets
  for each row execute function public.sync_on_totp_secrets();

create trigger sync_signals_totp_secrets_update
  after update on public.totp_secrets
  for each row
  when (old.* is distinct from new.*)
  execute function public.sync_on_totp_secrets();

-- 單筆驗證碼的覆寫：每筆的權限與群組清單的驗證碼數都可能變
create function public.sync_on_group_account_overwrites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  aid uuid;
begin
  if tg_op = 'DELETE' then
    aid := old.account_id;
  else
    aid := new.account_id;
  end if;
  perform sync_signal_group((select a.group_id from totp_accounts a where a.id = aid), array['groups', 'codes']);
  return null;
end;
$$;

create trigger sync_signals_group_account_overwrites
  after insert or update or delete on public.group_account_overwrites
  for each row execute function public.sync_on_group_account_overwrites();

-- Email / @ID 邀請：通知 email 對得上的使用者（同 my_invitations 用的 user_email）
create function public.sync_on_group_email_invites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  e text;
begin
  if tg_op = 'DELETE' then
    e := old.email;
  else
    e := new.email;
  end if;
  e := lower(e);
  perform sync_signal(
    array(
      select x.id
      from (
        select u.id from auth.users u where lower(u.email) = e
        union
        select p.id from profiles p where lower(p.email) = e
      ) x
      where user_email(x.id) = e
    ),
    array['invitations']
  );
  return null;
end;
$$;

create trigger sync_signals_group_email_invites
  after insert or update or delete on public.group_email_invites
  for each row execute function public.sync_on_group_email_invites();

-- 預設群組換了（my_groups 的 is_default）
create function public.sync_on_profiles_default_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform sync_signal(array[new.id], array['groups']);
  return null;
end;
$$;

create trigger sync_signals_profiles_default_group
  after update of default_group_id on public.profiles
  for each row
  when (old.default_group_id is distinct from new.default_group_id)
  execute function public.sync_on_profiles_default_group();

-- 刪帳號：清掉本人的訊號（刪帳號前 profiles_delete_owned_groups 刪群組時可能才剛寫進來）
create function public.sync_on_profiles_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from sync_signals s where s.user_id = old.id;
  return null;
end;
$$;

create trigger sync_signals_profiles_delete
  after delete on public.profiles
  for each row execute function public.sync_on_profiles_delete();

-- ---------- Realtime publication ----------
-- sync_signals 加進 supabase_realtime publication（新的 Supabase 專案已經有這個 publication；
-- 沒有就建立。FOR ALL TABLES 的 publication 已經包含這張表，pg_publication_tables 查得到就不加）
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sync_signals'
  ) then
    alter publication supabase_realtime add table public.sync_signals;
  end if;
end;
$$;


-- ============================================================
-- 14. 登入裝置
-- - session_devices：App 記下「這個 session 是哪台裝置」（裝置名稱、平台、App 版本、最後使用時間）。
--   auth.sessions 只有 user_agent，App 的是 Dart 預設值（Dart/3.x (dart:io)），認不出是哪台；
--   網站不寫這張表，瀏覽器的 user_agent 由前端解析出系統與瀏覽器。
-- - 登出自己的某一個 session：刪掉 auth.sessions 那一列時，auth.refresh_tokens（session_id → sessions.id on delete cascade）與
--   auth.mfa_amr_claims 會跟著刪掉，那台裝置下次換 token 會失敗而回到登入畫面；
--   已經發出去的 access token 仍可用到過期（預設 1 小時）。
--   「登出其他所有裝置」用 Auth API 的 signOut({ scope: 'others' })，不另外寫 RPC。
-- - 後台（VIEW_USERS）用 admin_user_sessions 查看別人的裝置，只能看、不能登出；ip 規則同 admin_user_login_history。
-- ============================================================

-- 發出這個請求的 session（access token 的 session_id claim）；沒有時 null
create function public.current_session_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'session_id', '')::uuid;
$$;

-- 寫入裝置資料前，順便清掉這位使用者已經不存在的 session 留下的列（登出、被撤銷、過期被清掉）
create function public.session_devices_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.session_devices d
  where d.user_id = new.user_id
    and d.session_id <> new.session_id
    and not exists (select 1 from auth.sessions s where s.id = d.session_id);
  return new;
end;
$$;

create trigger session_devices_cleanup
  before insert on public.session_devices
  for each row execute function public.session_devices_cleanup();

-- 使用者所有登入中的 session（auth.sessions，過了 not_after 的不列），附上 session_devices 的裝置資料。
-- p_current 排第一並標成 current（null = 沒有目前的 session），其餘依最後活動新到舊；p_show_ip false 時 ip 是 null：
-- [{ id, created_at, updated_at, refreshed_at, last_active_at, user_agent, ip, aal, current,
--    device_name, platform, app_version }]
-- last_active_at：App 的 session 是 App 回報的最後使用（在畫面上、沒鎖定時每 5 分鐘與離開時寫）；網站是換 token、session 更新取最新的
create function public.user_sessions_json(p_uid uuid, p_current uuid, p_show_ip boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', x.id,
      'created_at', x.created_at,
      'updated_at', x.updated_at,
      'refreshed_at', x.refreshed_at,
      'last_active_at', x.last_active_at,
      'user_agent', x.user_agent,
      'ip', x.ip,
      'aal', x.aal,
      'current', x.is_current,
      'device_name', x.device_name,
      'platform', x.platform,
      'app_version', x.app_version
    ) order by x.is_current desc, x.last_active_at desc nulls last, x.created_at desc), '[]'::jsonb)
  from (
    select
      s.id,
      s.created_at,
      s.updated_at,
      -- refreshed_at 是不帶時區的 UTC 時間
      (s.refreshed_at at time zone 'UTC') as refreshed_at,
      -- App 的 session 用 App 回報的最後使用（只常駐在背景換 token 不算）；網站用換 token 與 session 更新的時間
      case when d.session_id is null then greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'UTC') else d.last_seen_at end as last_active_at,
      left(s.user_agent, 512) as user_agent,
      case when p_show_ip then host(s.ip) end as ip,
      s.aal::text as aal,
      coalesce(s.id = p_current, false) as is_current,
      d.device_name,
      d.platform,
      d.app_version
    from auth.sessions s
    left join public.session_devices d on d.session_id = s.id and d.user_id = s.user_id
    where s.user_id = p_uid
      and (s.not_after is null or s.not_after > now())
  ) x;
$$;

-- 自己所有登入中的 session（current = 發出這個請求的 session，排第一）
create function public.list_my_sessions()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := public.require_uid();
  cur uuid := public.current_session_id();
begin
  return public.user_sessions_json(uid, cur, true);
end;
$$;

-- 登出自己的某一個 session（不能是目前的 session，請直接登出）
create function public.revoke_my_session(session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.require_uid();
  target uuid := revoke_my_session.session_id;
begin
  if target is null then
    raise exception '找不到這個裝置';
  end if;
  if target = public.current_session_id() then
    raise exception '這是目前使用中的裝置，要登出請直接按「登出」';
  end if;

  -- refresh token 由外鍵 on delete cascade 一起刪掉
  delete from auth.sessions s where s.id = target and s.user_id = uid;
  if not found then
    raise exception '找不到這個裝置，可能已經登出了';
  end if;

  delete from public.session_devices d where d.session_id = target and d.user_id = uid;
end;
$$;

-- 使用者已登入的裝置（後台，VIEW_USERS，只能看）；管不到對方（階層不比對方高）時 ip 是 null；current 一律 false
create function public.admin_user_sessions(user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_target uuid := admin_user_sessions.user_id;
begin
  perform site_require(uid, 4);
  if not exists (select 1 from profiles p where p.id = p_target) then
    raise exception '找不到這位使用者';
  end if;
  return user_sessions_json(p_target, null, p_target = uid or site_can_manage_user(uid, p_target));
end;
$$;


-- ============================================================
-- 15. 通知、公告、最低版本
-- - notifications：每位使用者的通知（鈴鐺）。標題與內文由這裡的函式產生（固定的中文句型，帶入名稱），
--   網站與 App 直接顯示。內容只寫誰、哪個群組、做了什麼，不放驗證碼、金鑰、封鎖原因、IP、email。
-- - 事件：既有的 RPC／觸發器呼叫 notify()（或 notify_codes_changed()），notify 依 notification_prefs 決定
--   push_state（關掉 → skipped，鈴鐺裡照樣有），寫入後送 sync_signals topic 'notifications'。
--   自己做的動作不通知自己（new_login、vault_changed 除外）。
-- - 公告：後台（SEND_NOTIFICATIONS）用 admin_broadcast_send 依條件發給一群人，記在 broadcasts（一律保留）。
-- - 推播：notifications 有 pending 的 insert 之後（statement 層級觸發器）用 pg_net 呼叫 Edge Function push
--   （<project_url>/functions/v1/push，header x-push-secret）；project_url 與 push_webhook_secret 存在 Supabase Vault。
--   沒有 pg_net、Vault 或其中一個 secret 時安靜地跳過（push_state 留 pending）；呼叫失敗不會擋住原本的操作。
--   有 pg_cron 時每分鐘 push_retry() 補送；Edge Function 用 push_claim / push_finish（只給 service role）領取與回報。
-- - 全站設定 site_settings：notify_admin_changes（後台修改帳號時要不要通知本人）、min_app_version（App 最低版本，
--   app_config() 不用登入就能讀）。
-- - 保留：通知一年（prune_retention），刪帳號時跟著刪除。
-- ============================================================

-- ---------- 種類與共用 helper ----------

-- 通知種類（順序 = 設定頁的顯示順序）：type、類別、預設開關、locked（不能關）
create function public.notification_defaults()
returns jsonb
language sql
immutable
as $$
  select '[
    {"type": "announce_important",       "category": "system",  "default": true,  "locked": true},
    {"type": "announce_update",          "category": "system",  "default": true,  "locked": false},
    {"type": "announce_promo",           "category": "system",  "default": true,  "locked": false},
    {"type": "announce_other",           "category": "system",  "default": true,  "locked": false},
    {"type": "new_login",                "category": "account", "default": true,  "locked": false},
    {"type": "vault_changed",            "category": "account", "default": true,  "locked": false},
    {"type": "admin_changed_role",       "category": "account", "default": true,  "locked": false},
    {"type": "admin_changed_username",   "category": "account", "default": true,  "locked": false},
    {"type": "admin_changed_codes",      "category": "account", "default": true,  "locked": false},
    {"type": "group_invite",             "category": "feature", "default": true,  "locked": false},
    {"type": "invite_answered",          "category": "feature", "default": true,  "locked": false},
    {"type": "member_added",             "category": "feature", "default": true,  "locked": false},
    {"type": "member_removed",           "category": "feature", "default": true,  "locked": false},
    {"type": "member_banned",            "category": "feature", "default": true,  "locked": false},
    {"type": "group_roles_changed",      "category": "feature", "default": true,  "locked": false},
    {"type": "ownership_received",       "category": "feature", "default": true,  "locked": false},
    {"type": "group_deleted",            "category": "feature", "default": true,  "locked": false},
    {"type": "group_encryption_changed", "category": "feature", "default": true,  "locked": false},
    {"type": "codes_changed",            "category": "feature", "default": false, "locked": false}
  ]'::jsonb;
$$;

-- 一種通知的設定（{ type, category, default, locked }）；未知的 type 回傳 null
create function public.notification_type(p_type text)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select e from jsonb_array_elements(notification_defaults()) e where e ->> 'type' = p_type;
$$;

-- 這位使用者有沒有開這一種通知（locked 的一律開）
create function public.notify_enabled(p_uid uuid, p_type text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce((notification_type(p_type) ->> 'locked')::boolean, false) then true
    else coalesce(
      (select case when jsonb_typeof(np.overrides -> p_type) = 'boolean' then (np.overrides ->> p_type)::boolean end
       from notification_prefs np where np.user_id = p_uid),
      (notification_type(p_type) ->> 'default')::boolean,
      true)
  end;
$$;

-- 通知內文裡的名稱：名稱 → @ID → 「一位使用者」（不用 email）
create function public.notify_name(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select coalesce(nullif(btrim(p.name), ''), '@' || p.username) from profiles p where p.id = p_uid),
    '一位使用者');
$$;

-- 公告的連結：空的 → null；只接受站內路徑（/ 開頭、不是 //、沒有空白與反斜線、最多 500 字），否則 raise
create function public.notify_norm_link(p_link text)
returns text
language plpgsql
immutable
as $$
declare
  l text := btrim(coalesce(p_link, ''));
begin
  if l = '' then
    return null;
  end if;
  if char_length(l) > 500 or l !~ '^/' or l ~ '^//' or l ~ '[\s\\]' or l ~ '[[:cntrl:]]' then
    raise exception '連結只能是站內路徑（以 / 開頭）';
  end if;
  return l;
end;
$$;

-- 寫通知給 p_uids（去重、略過不存在的 profile）；回傳寫了幾則。
-- p_data.actor_id 是操作者：不通知操作者自己（new_login、vault_changed 除外）；
-- 防灌：同一位操作者、同一種通知、同一位收件人一小時內最多 30 則，超過的不寫。
-- push_state：收件人關掉這一種就是 skipped（鈴鐺裡照樣有）。寫完送 sync_signals 'notifications'
create function public.notify(p_uids uuid[], p_type text, p_title text, p_body text, p_link text, p_data jsonb,
                              p_exclude_session uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  info jsonb := notification_type(p_type);
  d jsonb := case when jsonb_typeof(p_data) = 'object' then p_data else '{}'::jsonb end;
  actor uuid;
  self_ok boolean := p_type in ('new_login', 'vault_changed');
  uids uuid[];
begin
  if info is null then
    raise exception '未知的通知種類：%', p_type;
  end if;
  if coalesce(d ->> 'actor_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    actor := (d ->> 'actor_id')::uuid;
  end if;

  with ins as (
    insert into notifications (user_id, category, type, title, body, link, data, exclude_session, push_state)
    select r.u, info ->> 'category', p_type, left(coalesce(p_title, ''), 100), left(coalesce(p_body, ''), 500),
           case when char_length(p_link) <= 500 and p_link ~ '^/' and p_link !~ '^//' then p_link end,
           d, p_exclude_session,
           case when notify_enabled(r.u, p_type) then 'pending' else 'skipped' end
    from (select distinct x as u from unnest(coalesce(p_uids, '{}'::uuid[])) x where x is not null) r
    where exists (select 1 from profiles p where p.id = r.u)
      and (self_ok or actor is null or r.u <> actor)
      and (actor is null or (
        select count(*) from notifications n
        where n.user_id = r.u and n.type = p_type and n.data ->> 'actor_id' = actor::text
          and n.created_at > now() - interval '1 hour') < 30)
    returning user_id
  )
  select coalesce(array_agg(ins.user_id), '{}') into uids from ins;

  if cardinality(uids) > 0 then
    perform sync_signal(uids, array['notifications']);
  end if;
  return cardinality(uids);
end;
$$;

-- codes_changed 的內文
create function public.notify_codes_body(p_actor text, p_group text, p_added int, p_removed int)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_added, 0) > 0 and coalesce(p_removed, 0) > 0
      then format('%s 在「%s」新增了 %s 筆、刪除了 %s 筆驗證碼。', p_actor, p_group, p_added, p_removed)
    when coalesce(p_added, 0) > 0
      then format('%s 在「%s」新增了 %s 筆驗證碼。', p_actor, p_group, p_added)
    else format('%s 在「%s」刪除了 %s 筆驗證碼。', p_actor, p_group, coalesce(p_removed, 0))
  end;
$$;

-- 群組驗證碼新增 / 刪除（codes_changed）：通知看得到 p_ids 其中至少一筆的成員（操作者除外）；刪除要在刪掉之前呼叫。
-- 合併：同一位操作者、同一個群組、10 分鐘內、收件人還沒讀的那一則，數量累加、時間更新（推播只在第一次送）；
-- 一次匯入多筆只產生一則
create function public.notify_codes_changed(p_gid uuid, p_actor uuid, p_ids uuid[], p_added int, p_removed int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  gname text;
  aname text;
  rcpt uuid[];
  merged uuid[];
begin
  if p_gid is null or p_actor is null or coalesce(cardinality(p_ids), 0) = 0 then
    return;
  end if;
  select g.name into gname from groups g where g.id = p_gid;
  if gname is null then
    return;
  end if;
  select coalesce(array_agg(m.user_id), '{}') into rcpt
  from group_members m
  where m.group_id = p_gid and m.user_id <> p_actor
    and exists (select 1 from unnest(p_ids) a where account_permissions(a, m.user_id) & 2 <> 0);
  if cardinality(rcpt) = 0 then
    return;
  end if;
  aname := notify_name(p_actor);

  with upd as (
    update notifications n
    set data = n.data || jsonb_build_object(
          'added', coalesce((n.data ->> 'added')::int, 0) + coalesce(p_added, 0),
          'removed', coalesce((n.data ->> 'removed')::int, 0) + coalesce(p_removed, 0)),
        body = notify_codes_body(aname, gname,
                                 coalesce((n.data ->> 'added')::int, 0) + coalesce(p_added, 0),
                                 coalesce((n.data ->> 'removed')::int, 0) + coalesce(p_removed, 0)),
        created_at = now()
    where n.user_id = any (rcpt) and n.type = 'codes_changed' and n.read_at is null
      and n.data ->> 'group_id' = p_gid::text and n.data ->> 'actor_id' = p_actor::text
      and n.created_at > now() - interval '10 minutes'
    returning n.user_id
  )
  select coalesce(array_agg(distinct upd.user_id), '{}') into merged from upd;

  if cardinality(merged) > 0 then
    perform sync_signal(merged, array['notifications']);
  end if;
  perform notify(
    array(select x from unnest(rcpt) x where not (x = any (merged))),
    'codes_changed', '群組驗證碼有變動', notify_codes_body(aname, gname, p_added, p_removed),
    '/groups/' || p_gid::text,
    jsonb_build_object('group_id', p_gid, 'actor_id', p_actor, 'added', coalesce(p_added, 0), 'removed', coalesce(p_removed, 0)));
end;
$$;

-- 全站設定的值（沒有那一列時 null）
create function public.site_setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select s.value from site_settings s where s.key = p_key;
$$;

-- 後台修改帳號時要不要通知本人（site_settings.notify_admin_changes 的 role / username / codes；沒設定時開）
create function public.notify_admin_change_enabled(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case when jsonb_typeof(s.value -> p_key) = 'boolean' then (s.value ->> p_key)::boolean end
    from site_settings s where s.key = 'notify_admin_changes'
  ), true);
$$;

-- semver 比較：a < b → -1、相等 → 0、a > b → 1；任一個格式不對 → null。
-- 格式 [v]主.次.修[-預先發行][+建置]；預先發行比正式版舊（1.5.0-beta.1 < 1.5.0），建置資訊忽略
create function public.semver_cmp(a text, b text)
returns int
language plpgsql
immutable
as $$
declare
  re constant text := '^v?(\d{1,9})\.(\d{1,9})\.(\d{1,9})(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$';
  ra text[] := regexp_match(btrim(coalesce(a, '')), re);
  rb text[] := regexp_match(btrim(coalesce(b, '')), re);
  pa text[];
  pb text[];
  x text;
  y text;
  i int;
begin
  if ra is null or rb is null then
    return null;
  end if;
  for i in 1..3 loop
    if ra[i]::bigint <> rb[i]::bigint then
      return case when ra[i]::bigint < rb[i]::bigint then -1 else 1 end;
    end if;
  end loop;
  if ra[4] is null and rb[4] is null then
    return 0;
  elsif ra[4] is null then
    return 1;
  elsif rb[4] is null then
    return -1;
  end if;
  pa := string_to_array(ra[4], '.');
  pb := string_to_array(rb[4], '.');
  for i in 1..greatest(cardinality(pa), cardinality(pb)) loop
    if i > cardinality(pa) then
      return -1;
    elsif i > cardinality(pb) then
      return 1;
    end if;
    x := pa[i];
    y := pb[i];
    if x ~ '^\d+$' and y ~ '^\d+$' then
      if x::numeric <> y::numeric then
        return case when x::numeric < y::numeric then -1 else 1 end;
      end if;
    elsif x ~ '^\d+$' then
      return -1;
    elsif y ~ '^\d+$' then
      return 1;
    elsif x <> y then
      return case when x collate "C" < y collate "C" then -1 else 1 end;
    end if;
  end loop;
  return 0;
end;
$$;

-- ---------- 自己的通知 ----------

-- 我的通知（新到舊）：[{ id, category, type, title, body, link, data, created_at, read_at, push_state }]。
-- p_category：null = 全部、system / account / feature；p_before：上一頁最後一筆的 id；p_limit 1～100（預設 30）
create function public.notifications_list(p_category text default null, p_before bigint default null, p_limit int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  c text := nullif(btrim(coalesce(p_category, '')), '');
  cur_at timestamptz;
begin
  if c is not null and c not in ('system', 'account', 'feature') then
    raise exception '通知類別不正確';
  end if;
  if p_before is not null then
    select n.created_at into cur_at from notifications n where n.id = p_before and n.user_id = uid;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', x.id, 'category', x.category, 'type', x.type, 'title', x.title, 'body', x.body, 'link', x.link,
      'data', x.data, 'created_at', x.created_at, 'read_at', x.read_at, 'push_state', x.push_state
    ) order by x.created_at desc, x.id desc)
    from (
      select * from notifications n
      where n.user_id = uid
        and (c is null or n.category = c)
        and (p_before is null
             or (cur_at is null and n.id < p_before)
             or (n.created_at, n.id) < (cur_at, p_before))
      order by n.created_at desc, n.id desc
      limit greatest(1, least(coalesce(p_limit, 30), 100))
    ) x
  ), '[]'::jsonb);
end;
$$;

-- 未讀數：{ total, system, account, feature }
create function public.notifications_unread_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
begin
  return (
    select jsonb_build_object(
      'total', count(*),
      'system', count(*) filter (where n.category = 'system'),
      'account', count(*) filter (where n.category = 'account'),
      'feature', count(*) filter (where n.category = 'feature'))
    from notifications n
    where n.user_id = uid and n.read_at is null
  );
end;
$$;

-- 標為已讀：p_ids（最多 1000 個）、p_category 都 null = 全部；兩個都給 = 交集。回傳這次標了幾則
create function public.notifications_mark_read(p_ids bigint[] default null, p_category text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  c text := nullif(btrim(coalesce(p_category, '')), '');
  k int;
begin
  if c is not null and c not in ('system', 'account', 'feature') then
    raise exception '通知類別不正確';
  end if;
  if coalesce(cardinality(p_ids), 0) > 1000 then
    raise exception '一次最多 1000 則';
  end if;
  update notifications n set read_at = now()
  where n.user_id = uid and n.read_at is null
    and (p_ids is null or n.id = any (p_ids))
    and (c is null or n.category = c);
  get diagnostics k = row_count;
  if k > 0 then
    perform sync_signal(array[uid], array['notifications']);
  end if;
  return k;
end;
$$;

-- 我的通知開關：[{ type, category, default, locked, enabled }]（順序同 notification_defaults）
create function public.notification_prefs_get()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
begin
  return (
    select jsonb_agg(t.e || jsonb_build_object('enabled', notify_enabled(uid, t.e ->> 'type')) order by t.ord)
    from jsonb_array_elements(notification_defaults()) with ordinality as t(e, ord)
  );
end;
$$;

-- 修改通知開關：p_overrides { "<type>": true | false } 合併到現有設定；未知的 type、不是 boolean 的值、
-- 關掉不能關的（announce_important）都忽略。只存和預設不同的。回傳同 notification_prefs_get
create function public.notification_prefs_set(p_overrides jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  o jsonb := case when jsonb_typeof(p_overrides) = 'object' then p_overrides else '{}'::jsonb end;
  cur jsonb;
  nxt jsonb;
begin
  select np.overrides into cur from notification_prefs np where np.user_id = uid for update;
  cur := coalesce(cur, '{}'::jsonb);
  select coalesce(jsonb_object_agg(t.k, t.val), '{}'::jsonb) into nxt
  from (
    select e ->> 'type' as k,
           case when jsonb_typeof(o -> (e ->> 'type')) = 'boolean' then o -> (e ->> 'type')
                when jsonb_typeof(cur -> (e ->> 'type')) = 'boolean' then cur -> (e ->> 'type') end as val,
           e -> 'default' as def
    from jsonb_array_elements(notification_defaults()) e
    where not (e ->> 'locked')::boolean
  ) t
  where t.val is not null and t.val <> t.def;
  insert into notification_prefs (user_id, overrides, updated_at) values (uid, nxt, now())
  on conflict (user_id) do update set overrides = excluded.overrides, updated_at = excluded.updated_at;
  return notification_prefs_get();
end;
$$;

-- 推播 token：寫到目前這個 session（access token 的 session_id）的 session_devices，那列還沒有就建立；
-- null / 空字串 = 取消（登出前呼叫）。同一個 token 在其他 session 的列會被清掉
create function public.register_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  sid uuid := current_session_id();
  t text := nullif(btrim(coalesce(p_token, '')), '');
begin
  if sid is null then
    raise exception '找不到目前的裝置';
  end if;
  if t is not null and (char_length(t) > 4096 or t !~ '^[!-~]+$') then
    raise exception '推播 token 格式不正確';
  end if;
  if t is not null then
    update session_devices d set push_token = null, push_updated_at = now()
    where md5(d.push_token) = md5(t) and d.push_token = t and d.session_id <> sid;
  end if;
  insert into session_devices (session_id, user_id, push_token, push_updated_at)
  values (sid, uid, t, now())
  on conflict (session_id) do update
    set push_token = excluded.push_token, push_updated_at = excluded.push_updated_at
    where session_devices.user_id = uid;
end;
$$;

-- 使用者直接寫 session_devices（PostgREST）時，推播 token 靜靜地維持原值（只能透過 register_push_token 改）。
-- 不是 security definer：要看到呼叫者自己的 current_user
create function public.session_devices_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.push_token := null;
    new.push_updated_at := null;
  else
    new.push_token := old.push_token;
    new.push_updated_at := old.push_updated_at;
  end if;
  return new;
end;
$$;

create trigger session_devices_guard
  before insert or update on public.session_devices
  for each row execute function public.session_devices_guard();

-- App 設定（不用登入）：{ min_app_version: { version, message } | null }
create function public.app_config()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('min_app_version', (
    select case when jsonb_typeof(s.value) = 'object' then s.value end
    from site_settings s where s.key = 'min_app_version'));
$$;

-- ---------- 事件：新的登入 ----------

-- login_history 新增一筆（/api/record-login，同一個 session 只記一次）→ 通知本人；推播不送到登入的那台裝置。
-- 帳號的第一次登入不通知
create function public.login_history_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from login_history h where h.user_id = new.user_id and h.id <> new.id) then
    perform notify(array[new.user_id], 'new_login', '新的登入',
                   format('你的帳號剛剛在「%s」登入。如果不是你本人，請盡快檢查帳號安全並登出不認得的裝置。',
                          coalesce(nullif(btrim(new.device), ''), '新的裝置')),
                   '/me/activity', jsonb_build_object('login_id', new.id), new.session_id);
  end if;
  return null;
end;
$$;

create trigger login_history_notify
  after insert on public.login_history
  for each row execute function public.login_history_notify();

-- ---------- 公告（SEND_NOTIFICATIONS）----------

-- filter 裡的 uuid 陣列：null / 空陣列 → null；不是 uuid 字串的陣列或超過 p_max 個 → raise
create function public.broadcast_filter_uuids(p_value jsonb, p_max int)
returns uuid[]
language plpgsql
immutable
as $$
declare
  r uuid[];
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) > p_max
     or exists (select 1 from jsonb_array_elements(p_value) e
                where jsonb_typeof(e) <> 'string'
                   or (e #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception '通知對象條件格式不正確';
  end if;
  select array_agg(distinct (e #>> '{}')::uuid) into r from jsonb_array_elements(p_value) e;
  return r;
end;
$$;

-- 公告的收件人：每人一列 { user_id, push_sessions, devices, push_devices }。條件（全部可選、同時符合才算，至少要有一個）：
--   使用者條件 all_users、user_ids、site_role_ids（含 @everyone = 所有人）、last_seen_days（最後活動在 N 天內）
--   裝置條件 platforms（ios / android / macos / linux / windows / web）、session_ids、version_min、version_max（含，semver）
-- 有裝置條件：給至少有一台符合的 App 裝置（登入中的 session_devices；last_seen_days 也套用在裝置上）的人，
--   push_sessions = 符合的那幾台；web = 只用網站（沒有登入中的 App 裝置、有登入紀錄），
--   session_ids 指到網站的 session 也算（沒有推播），前提是 platforms 沒給或含 web、沒有版本條件。
-- 沒有裝置條件：給所有符合的人，push_sessions null（推播送他全部裝置）。
-- devices / push_devices：會收到的 App 裝置數、其中有推播 token 的
create function public.broadcast_targets(p_filter jsonb)
returns table (user_id uuid, push_sessions uuid[], devices int, push_devices int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  f jsonb := case when jsonb_typeof(p_filter) = 'object' then p_filter else '{}'::jsonb end;
  v_all boolean := false;
  v_users uuid[] := broadcast_filter_uuids(f -> 'user_ids', 10000);
  v_roles uuid[] := broadcast_filter_uuids(f -> 'site_role_ids', 1000);
  v_sessions uuid[] := broadcast_filter_uuids(f -> 'session_ids', 1000);
  v_platforms text[];
  v_min text;
  v_max text;
  v_days int;
  everyone boolean;
  dev_cond boolean;
begin
  if coalesce(jsonb_typeof(f -> 'all_users'), 'null') not in ('boolean', 'null') then
    raise exception '通知對象條件格式不正確';
  end if;
  v_all := coalesce((f ->> 'all_users')::boolean, false);

  if coalesce(jsonb_typeof(f -> 'platforms'), 'null') <> 'null' then
    if jsonb_typeof(f -> 'platforms') <> 'array'
       or exists (select 1 from jsonb_array_elements(f -> 'platforms') e
                  where jsonb_typeof(e) <> 'string'
                     or (e #>> '{}') not in ('ios', 'android', 'macos', 'linux', 'windows', 'web')) then
      raise exception '通知對象條件格式不正確';
    end if;
    select array_agg(distinct e #>> '{}') into v_platforms from jsonb_array_elements(f -> 'platforms') e;
  end if;

  if coalesce(jsonb_typeof(f -> 'version_min'), 'null') <> 'null' then
    v_min := nullif(btrim(f ->> 'version_min'), '');
    if jsonb_typeof(f -> 'version_min') <> 'string' or (v_min is not null and semver_cmp(v_min, v_min) is null) then
      raise exception '版本格式不正確';
    end if;
  end if;
  if coalesce(jsonb_typeof(f -> 'version_max'), 'null') <> 'null' then
    v_max := nullif(btrim(f ->> 'version_max'), '');
    if jsonb_typeof(f -> 'version_max') <> 'string' or (v_max is not null and semver_cmp(v_max, v_max) is null) then
      raise exception '版本格式不正確';
    end if;
  end if;

  if coalesce(jsonb_typeof(f -> 'last_seen_days'), 'null') <> 'null' then
    if jsonb_typeof(f -> 'last_seen_days') <> 'number' or (f ->> 'last_seen_days') !~ '^[0-9]{1,4}$'
       or (f ->> 'last_seen_days')::int not between 1 and 3650 then
      raise exception '通知對象條件格式不正確';
    end if;
    v_days := (f ->> 'last_seen_days')::int;
  end if;

  if not v_all and v_users is null and v_roles is null and v_platforms is null and v_sessions is null
     and v_min is null and v_max is null and v_days is null then
    raise exception '請選擇通知對象';
  end if;

  everyone := v_roles is not null and exists (select 1 from site_roles r where r.id = any (v_roles) and r.is_default);
  dev_cond := v_platforms is not null or v_sessions is not null or v_min is not null or v_max is not null;

  return query
  with u as (
    select p.id
    from profiles p
    where (v_users is null or p.id = any (v_users))
      and (v_roles is null or everyone
           or exists (select 1 from site_user_roles ur where ur.user_id = p.id and ur.role_id = any (v_roles)))
      and (v_days is null or greatest(
             p.last_login_at,
             (select max(d.last_seen_at) from session_devices d where d.user_id = p.id),
             (select max(h.created_at) from login_history h where h.user_id = p.id),
             (select max(greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'UTC'))
              from auth.sessions s where s.user_id = p.id)
           ) >= now() - make_interval(days => v_days))
  ),
  dev as (
    select d.user_id as uid, d.session_id as sid, d.push_token is not null as has_token,
           (v_platforms is null or d.platform = any (v_platforms))
           and (v_sessions is null or d.session_id = any (v_sessions))
           and (v_min is null or coalesce(semver_cmp(d.app_version, v_min) >= 0, false))
           and (v_max is null or coalesce(semver_cmp(d.app_version, v_max) <= 0, false))
           and (v_days is null or d.last_seen_at >= now() - make_interval(days => v_days)) as hit
    from session_devices d
    join auth.sessions s on s.id = d.session_id and s.user_id = d.user_id
    where (s.not_after is null or s.not_after > now())
      and d.user_id in (select u.id from u)
  ),
  agg as (
    select x.uid,
           coalesce(array_agg(x.sid) filter (where x.hit), '{}') as hit_sessions,
           (count(*) filter (where x.hit))::int as hit_devices,
           (count(*) filter (where x.hit and x.has_token))::int as hit_push,
           count(*)::int as all_devices,
           (count(*) filter (where x.has_token))::int as all_push
    from dev x
    group by x.uid
  ),
  per as (
    select u.id, a.hit_sessions, coalesce(a.hit_devices, 0) as hit_devices, coalesce(a.hit_push, 0) as hit_push,
           coalesce(a.all_devices, 0) as all_devices, coalesce(a.all_push, 0) as all_push,
           coalesce(
             v_min is null and v_max is null and (v_platforms is null or 'web' = any (v_platforms)) and (
               (v_sessions is not null and exists (
                  select 1 from auth.sessions s
                  where s.user_id = u.id and s.id = any (v_sessions) and (s.not_after is null or s.not_after > now())
                    and not exists (select 1 from session_devices d where d.session_id = s.id and d.user_id = s.user_id)))
               or (v_sessions is null and v_platforms is not null and a.uid is null
                   and exists (select 1 from login_history h where h.user_id = u.id))),
             false) as web_hit
    from u
    left join agg a on a.uid = u.id
  )
  select per.id,
         case when dev_cond then coalesce(per.hit_sessions, '{}'::uuid[]) end,
         case when dev_cond then per.hit_devices else per.all_devices end,
         case when dev_cond then per.hit_push else per.all_push end
  from per
  where not dev_cond or per.hit_devices > 0 or per.web_hit;
end;
$$;

-- 預覽公告對象（SEND_NOTIFICATIONS）：{ users, devices, push_devices, limit }
create function public.admin_broadcast_preview(p_filter jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  r jsonb;
begin
  perform site_require(uid, 1024);
  select jsonb_build_object('users', count(*), 'devices', coalesce(sum(t.devices), 0),
                            'push_devices', coalesce(sum(t.push_devices), 0), 'limit', 10000)
  into r
  from broadcast_targets(p_filter) t;
  return r;
end;
$$;

-- 發公告（SEND_NOTIFICATIONS，重要公告也一樣）：kind important / update / promo / other（type announce_<kind>）；
-- 標題 1～100 字、內文最多 500 字、連結只能是站內路徑；一次最多 10,000 人；每人每小時最多 20 次。
-- 寫 broadcasts 與 audit_logs（notification.broadcast）；回傳 { broadcast_id, users, devices, push_devices }
create function public.admin_broadcast_send(p_kind text, p_title text, p_body text, p_link text, p_filter jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  k text := lower(btrim(coalesce(p_kind, '')));
  t text := btrim(coalesce(p_title, ''));
  b text := btrim(coalesce(p_body, ''));
  l text;
  f jsonb := case when jsonb_typeof(p_filter) = 'object' then p_filter else '{}'::jsonb end;
  tp text;
  bid bigint;
  n_users int;
  n_dev int;
  n_push int;
begin
  perform site_require(uid, 1024);
  if k not in ('important', 'update', 'promo', 'other') then
    raise exception '公告類別不正確';
  end if;
  if t = '' then
    raise exception '請輸入標題';
  end if;
  if char_length(t) > 100 then
    raise exception '標題最多 100 個字';
  end if;
  if char_length(b) > 500 then
    raise exception '內文最多 500 個字';
  end if;
  l := notify_norm_link(p_link);
  if (select count(*) from broadcasts x where x.created_by = uid and x.created_at > now() - interval '1 hour') >= 20 then
    raise exception '發送太頻繁，請稍後再試';
  end if;
  tp := 'announce_' || k;

  insert into broadcasts (kind, title, body, link, filter, created_by)
  values (k, t, b, l, f, uid)
  returning id into bid;

  with tg as (
    select * from broadcast_targets(f)
  ), ins as (
    insert into notifications (user_id, category, type, title, body, link, data, broadcast_id, push_sessions, push_state)
    select tg.user_id, 'system', tp, t, b, l, jsonb_build_object('broadcast_id', bid, 'kind', k), bid, tg.push_sessions,
           case when notify_enabled(tg.user_id, tp) then 'pending' else 'skipped' end
    from tg
    returning 1
  )
  select (select count(*) from ins), coalesce(sum(tg.devices), 0), coalesce(sum(tg.push_devices), 0)
  into n_users, n_dev, n_push
  from tg;

  if n_users = 0 then
    raise exception '沒有符合條件的使用者';
  end if;
  if n_users > 10000 then
    raise exception '通知對象超過 10,000 人，請縮小範圍';
  end if;

  update broadcasts x set user_count = n_users, device_count = n_dev, push_count = n_push where x.id = bid;
  perform sync_signal(array(select n.user_id from notifications n where n.broadcast_id = bid), array['notifications']);
  perform audit(null, uid, 'notification.broadcast', 'broadcast', bid::text, jsonb_build_object(
    'name', t, 'kind', k, 'title', t, 'user_count', n_users, 'device_count', n_dev, 'filter', f));
  return jsonb_build_object('broadcast_id', bid, 'users', n_users, 'devices', n_dev, 'push_devices', n_push);
end;
$$;

-- 發送紀錄（SEND_NOTIFICATIONS），新到舊：[{ id, kind, title, body, link, filter, created_by, created_at,
--   user_count, device_count, push_count }]；created_by 的 email 只給有 VIEW_USERS 的人
create function public.admin_broadcasts_list(p_before bigint default null, p_limit int default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  perms bigint;
begin
  perms := site_require(uid, 1024);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', b.id, 'kind', b.kind, 'title', b.title, 'body', b.body, 'link', b.link, 'filter', b.filter,
      'created_by', user_brief(b.created_by, perms & 4 <> 0), 'created_at', b.created_at,
      'user_count', b.user_count, 'device_count', b.device_count, 'push_count', b.push_count
    ) order by b.id desc)
    from (
      select * from broadcasts x
      where admin_broadcasts_list.p_before is null or x.id < admin_broadcasts_list.p_before
      order by x.id desc
      limit greatest(1, least(coalesce(admin_broadcasts_list.p_limit, 50), 200))
    ) b
  ), '[]'::jsonb);
end;
$$;

-- ---------- 全站設定（讀 VIEW_ADMIN、改 MANAGE_USERS）----------

-- { notify_admin_changes: { role, username, codes }, min_app_version: { version, message } | null }
create function public.admin_site_settings_get()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
begin
  perform site_require(uid, 2);
  return jsonb_build_object(
    'notify_admin_changes', jsonb_build_object(
      'role', notify_admin_change_enabled('role'),
      'username', notify_admin_change_enabled('username'),
      'codes', notify_admin_change_enabled('codes')),
    'min_app_version', (select case when jsonb_typeof(s.value) = 'object' then s.value end
                        from site_settings s where s.key = 'min_app_version'));
end;
$$;

-- 修改全站設定（MANAGE_USERS）；回傳存進去的值，有變才記 site.settings.update。
--   notify_admin_changes：{ role?, username?, codes? } boolean，合併到現有值
--   min_app_version：null（清除）或 { version: semver, message: 最多 500 字 }
create function public.admin_site_settings_set(p_key text, p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  k text := btrim(coalesce(p_key, ''));
  v jsonb;
  old jsonb;
  ver text;
  msg text;
begin
  perform site_require(uid, 8);
  if k = 'notify_admin_changes' then
    if p_value is null or jsonb_typeof(p_value) <> 'object' then
      raise exception '設定格式不正確';
    end if;
    old := site_setting(k);
    v := jsonb_build_object(
      'role', case when jsonb_typeof(p_value -> 'role') = 'boolean' then p_value -> 'role'
                   else to_jsonb(notify_admin_change_enabled('role')) end,
      'username', case when jsonb_typeof(p_value -> 'username') = 'boolean' then p_value -> 'username'
                       else to_jsonb(notify_admin_change_enabled('username')) end,
      'codes', case when jsonb_typeof(p_value -> 'codes') = 'boolean' then p_value -> 'codes'
                    else to_jsonb(notify_admin_change_enabled('codes')) end);
  elsif k = 'min_app_version' then
    old := site_setting(k);
    if p_value is null or jsonb_typeof(p_value) = 'null' then
      v := 'null'::jsonb;
    elsif jsonb_typeof(p_value) <> 'object' or jsonb_typeof(p_value -> 'version') is distinct from 'string' then
      raise exception '設定格式不正確';
    else
      ver := btrim(p_value ->> 'version');
      if char_length(ver) > 32 or semver_cmp(ver, ver) is null then
        raise exception '版本格式不正確';
      end if;
      msg := btrim(coalesce(case when jsonb_typeof(p_value -> 'message') = 'string' then p_value ->> 'message' end, ''));
      if char_length(msg) > 500 then
        raise exception '說明文字最多 500 個字';
      end if;
      v := jsonb_build_object('version', ver, 'message', msg);
    end if;
  else
    raise exception '未知的設定';
  end if;

  insert into site_settings (key, value, updated_by, updated_at)
  values (k, v, uid, now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  if old is distinct from v then
    perform audit(null, uid, 'site.settings.update', 'setting', k,
                  jsonb_build_object('name', k, 'value', v, 'old_value', old));
  end if;
  return v;
end;
$$;

-- ---------- 推播（Edge Function push）----------

-- 呼叫 Edge Function：POST <vault project_url>/functions/v1/push，header x-push-secret = vault push_webhook_secret。
-- 用 pg_net（非同步，交易 commit 之後才真的送出）；沒有 pg_net、Vault 或 secret 就跳過；任何錯誤都吞掉，不擋原本的操作
create function public.push_kick()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  url text;
  secret text;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    return;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 order by created_at desc limit 1'
    into url using 'project_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 order by created_at desc limit 1'
    into secret using 'push_webhook_secret';
  if coalesce(btrim(url), '') = '' or coalesce(secret, '') = '' then
    return;
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 5000)'
    using rtrim(btrim(url), '/') || '/functions/v1/push', '{}'::jsonb,
          jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret);
exception when others then
  return;
end;
$$;

-- notifications 有 pending 的 insert 之後（每個 statement 一次）叫一次 Edge Function
create function public.notifications_push_kick()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from new_rows r where r.push_state = 'pending') then
    perform push_kick();
  end if;
  return null;
end;
$$;

create trigger notifications_push_kick
  after insert on public.notifications
  referencing new table as new_rows
  for each statement execute function public.notifications_push_kick();

-- 補送（pg_cron 每分鐘）：有超過 1 分鐘還 pending、或領取超過 5 分鐘還沒回報的，再叫一次 Edge Function
create function public.push_retry()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from notifications n
    where n.push_state in ('pending', 'sending')
      and ((n.push_state = 'pending' and n.created_at < now() - interval '1 minute')
           or (n.push_state = 'sending' and n.push_claimed_at < now() - interval '5 minutes'))
  ) then
    perform push_kick();
  end if;
end;
$$;

-- Edge Function 驗證 x-push-secret（只給 service role）
create function public.push_check_secret(p_secret text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s text;
begin
  if p_secret is null or p_secret = '' or to_regclass('vault.decrypted_secrets') is null then
    return false;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 order by created_at desc limit 1'
    into s using 'push_webhook_secret';
  return coalesce(s, '') <> '' and s = p_secret;
end;
$$;

-- Edge Function 領取要推播的通知（只給 service role）：最多 p_limit（≤ 500）則 pending
-- （或領取超過 5 分鐘還沒回報的），標成 sending；回傳 [{ id, category, type, title, body, link, tokens }]。
-- tokens：收件人登入中的裝置的推播 token（排除 exclude_session；公告有裝置條件時只給符合的裝置）；
-- 沒有任何 token 的直接標 sent，不回傳。超過 1 天還沒送出的標 skipped 不送；已經登出的 session 的 token 清掉
create function public.push_claim(p_limit int default 500)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ids bigint[];
  result jsonb;
begin
  update notifications n set push_state = 'skipped'
  where n.push_state in ('pending', 'sending') and n.created_at < now() - interval '1 day'
    and (n.push_state = 'pending' or n.push_claimed_at < now() - interval '5 minutes');

  select coalesce(array_agg(x.id), '{}') into ids
  from (
    select n.id from notifications n
    where n.push_state = 'pending'
       or (n.push_state = 'sending' and n.push_claimed_at < now() - interval '5 minutes')
    order by n.id
    limit greatest(1, least(coalesce(p_limit, 500), 500))
    for update skip locked
  ) x;
  if cardinality(ids) = 0 then
    return '[]'::jsonb;
  end if;

  update notifications n set push_state = 'sending', push_claimed_at = now() where n.id = any (ids);

  update session_devices d set push_token = null, push_updated_at = now()
  where d.push_token is not null
    and not exists (select 1 from auth.sessions s
                    where s.id = d.session_id and s.user_id = d.user_id and (s.not_after is null or s.not_after > now()));

  with t as (
    select n.id, n.category, n.type, n.title, n.body, n.link,
           coalesce((
             select array_agg(d.push_token order by d.push_updated_at desc nulls last)
             from session_devices d
             where d.user_id = n.user_id and d.push_token is not null
               and d.session_id is distinct from n.exclude_session
               and (n.push_sessions is null or d.session_id = any (n.push_sessions))
           ), '{}') as tokens
    from notifications n
    where n.id = any (ids)
  ), done as (
    update notifications n set push_state = 'sent'
    from t
    where n.id = t.id and cardinality(t.tokens) = 0
    returning n.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'category', t.category, 'type', t.type, 'title', t.title, 'body', t.body, 'link', t.link,
           'tokens', to_jsonb(t.tokens)
         ) order by t.id) filter (where cardinality(t.tokens) > 0), '[]'::jsonb)
  into result
  from t;
  return result;
end;
$$;

-- Edge Function 回報送完（只給 service role）：p_ids 標成 sent；p_bad_tokens（FCM 說無效的）從裝置清掉
create function public.push_finish(p_ids bigint[], p_bad_tokens text[] default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update notifications n set push_state = 'sent'
  where n.id = any (coalesce(p_ids, '{}')) and n.push_state = 'sending';
  if coalesce(cardinality(p_bad_tokens), 0) > 0 then
    update session_devices d set push_token = null, push_updated_at = now()
    where d.push_token is not null
      and md5(d.push_token) = any (array(select md5(x) from unnest(p_bad_tokens) x where x is not null))
      and d.push_token = any (p_bad_tokens);
  end if;
end;
$$;


-- ============================================================
-- 16. 權限設定（GRANT / REVOKE）
-- Supabase 預設會把 public schema 新建的資料表、函式權限授予 anon / authenticated / service_role，
-- 這裡把不該開放的收回。部分 Supabase 專案不會自動授權，所以 service_role 需要的權限也明確寫出來。
-- ============================================================

grant usage on schema public to anon, authenticated, service_role;

-- ---------- 資料表 ----------

-- profiles：使用者只能直接改自己的顯示資料；email、email_verified、vault、username、last_login_*、migrated、totp、
-- default_group_id、photo_custom 一律走 RPC（security definer）或 service role。新增 / 刪除 profile 也只由觸發器、ensure_profile 與後端處理。
-- creation_time、last_sign_in_time 留著欄位權限讓舊版前端送了不會失敗，值由 profiles_guard 觸發器維持原值。
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (name, photo_url, bg_photo_url, phone_number, creation_time, last_sign_in_time, migration_notified, updated_at)
  on table public.profiles to authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

-- legacy_import：只有 service_role（匯入腳本）需要存取；一般使用者沒有權限，也由 RLS（沒有 policy）擋下
revoke all on table public.legacy_import from anon, authenticated;
grant select, insert, update, delete on table public.legacy_import to service_role;

-- 只走 RPC 的資料表：一般使用者沒有任何權限；service_role（Next.js API route：產碼、刪除使用者、寫紀錄）可直接讀寫
revoke all on table
  public.totp_accounts, public.totp_secrets,
  public.site_roles, public.site_user_roles, public.site_pending_roles,
  public.groups, public.group_roles, public.group_members, public.group_member_roles,
  public.group_invites, public.group_email_invites, public.group_account_overwrites,
  public.audit_logs, public.group_bans, public.site_owner
from anon, authenticated;
grant select, insert, update, delete on table
  public.totp_accounts, public.totp_secrets,
  public.site_roles, public.site_user_roles, public.site_pending_roles,
  public.groups, public.group_roles, public.group_members, public.group_member_roles,
  public.group_invites, public.group_email_invites, public.group_account_overwrites,
  public.audit_logs, public.group_bans, public.site_owner
to service_role;

-- login_history：由 /api/record-login 用 service role 寫入，查詢走 RPC
revoke all on table public.login_history from anon, authenticated;
revoke all on sequence public.login_history_id_seq from anon, authenticated;
grant select, insert, delete on table public.login_history to service_role;
grant usage, select on sequence public.login_history_id_seq to service_role;

-- vault_escrow：只有 service role 讀（解密由團隊離線處理）與刪（/api/record-login 清掉帳號已刪除超過一年的）；寫入走 RPC
revoke all on table public.vault_escrow from anon, authenticated;
revoke all on sequence public.vault_escrow_id_seq from anon, authenticated;
grant select, delete on table public.vault_escrow to service_role;

-- sync_signals：authenticated 只能 select（policy 只看得到自己的列），寫入只由觸發器處理
revoke all on table public.sync_signals from anon, authenticated;
grant select on table public.sync_signals to authenticated;
grant select, insert, update, delete on table public.sync_signals to service_role;

-- session_devices：upsert（insert … on conflict do update）要 select、insert、update；刪除由 revoke_my_session 與觸發器處理
revoke all on table public.session_devices from anon, authenticated;
grant select, insert, update on table public.session_devices to authenticated;
grant select, insert, update, delete on table public.session_devices to service_role;

-- 通知、公告、全站設定：一律走 RPC；service_role 可直接讀寫
revoke all on table public.notifications, public.notification_prefs, public.broadcasts, public.site_settings
from anon, authenticated;
revoke all on sequence public.notifications_id_seq, public.broadcasts_id_seq from anon, authenticated;
grant select, insert, update, delete on table public.notifications, public.notification_prefs, public.broadcasts, public.site_settings
to service_role;

-- ---------- 內部函式：一般使用者不能直接呼叫 ----------
revoke execute on function public.require_uid() from public, anon, authenticated;
revoke execute on function public.user_email(uuid) from public, anon, authenticated;
revoke execute on function public.display_name(uuid) from public, anon, authenticated;
revoke execute on function public.user_brief(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.audit(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.audit_via_site(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.norm_color(text) from public, anon, authenticated;
revoke execute on function public.norm_role_name(text) from public, anon, authenticated;
revoke execute on function public.site_perm_name(bigint) from public, anon, authenticated;
revoke execute on function public.site_permissions(uuid) from public, anon, authenticated;
revoke execute on function public.site_top_position(uuid) from public, anon, authenticated;
revoke execute on function public.site_is_owner(uuid) from public, anon, authenticated;
revoke execute on function public.site_is_root(uuid) from public, anon, authenticated;
revoke execute on function public.site_require(uuid, bigint) from public, anon, authenticated;
revoke execute on function public.site_can_manage_position(uuid, int) from public, anon, authenticated;
revoke execute on function public.site_can_manage_user(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.site_admin_count() from public, anon, authenticated;
revoke execute on function public.site_assert_admin_left(bigint) from public, anon, authenticated;
revoke execute on function public.site_roles_renumber() from public, anon, authenticated;
revoke execute on function public.apply_pending_roles(uuid, text) from public, anon, authenticated;
revoke execute on function public.username_uuid_like(text) from public, anon, authenticated;
revoke execute on function public.username_reserved(text) from public, anon, authenticated;
revoke execute on function public.username_normalize(text) from public, anon, authenticated;
revoke execute on function public.username_assert(text, uuid) from public, anon, authenticated;
revoke execute on function public.profiles_username_guard() from public, anon, authenticated;
revoke execute on function public.profiles_guard() from public, anon, authenticated;
revoke execute on function public.claim_verified_email(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.legacy_target_group(uuid) from public, anon, authenticated;
revoke execute on function public.profiles_totp_to_accounts() from public, anon, authenticated;
revoke execute on function public.group_perm_name(bigint) from public, anon, authenticated;
revoke execute on function public.group_is_member(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.group_is_super(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.group_permissions(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.group_top_position(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.group_require(uuid, uuid, bigint) from public, anon, authenticated;
revoke execute on function public.group_can_manage_position(uuid, uuid, int) from public, anon, authenticated;
revoke execute on function public.group_can_manage_member(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.group_roles_renumber(uuid) from public, anon, authenticated;
revoke execute on function public.group_brief(uuid) from public, anon, authenticated;
revoke execute on function public.group_sees_emails(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.group_is_banned(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.group_find_user(text) from public, anon, authenticated;
revoke execute on function public.group_insert(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.default_group_name(uuid) from public, anon, authenticated;
revoke execute on function public.ensure_default_group(uuid) from public, anon, authenticated;
revoke execute on function public.default_group_of(uuid) from public, anon, authenticated;
revoke execute on function public.profiles_default_group_guard() from public, anon, authenticated;
revoke execute on function public.profiles_create_default_group() from public, anon, authenticated;
revoke execute on function public.groups_owner_guard() from public, anon, authenticated;
revoke execute on function public.profiles_delete_owned_groups() from public, anon, authenticated;
revoke execute on function public.group_members_set_position() from public, anon, authenticated;
revoke execute on function public.totp_norm_digits(jsonb, int) from public, anon, authenticated;
revoke execute on function public.totp_norm_period(jsonb, int) from public, anon, authenticated;
revoke execute on function public.totp_norm_algorithm(jsonb, text) from public, anon, authenticated;
revoke execute on function public.totp_norm_bool(jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.totp_norm_text(jsonb, text) from public, anon, authenticated;
revoke execute on function public.totp_import_items(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.totp_assert_caps(jsonb) from public, anon, authenticated;
revoke execute on function public.totp_apply_patch(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.totp_reorder_items(uuid, uuid, text[]) from public, anon, authenticated;
revoke execute on function public.totp_items_json(uuid) from public, anon, authenticated;
revoke execute on function public.totp_current_owner() from public, anon, authenticated;
revoke execute on function public.totp_items_secrets(jsonb) from public, anon, authenticated;
revoke execute on function public.totp_group_items_json(uuid) from public, anon, authenticated;
revoke execute on function public.group_assert_secret_format(uuid, text[]) from public, anon, authenticated;
revoke execute on function public.group_add_items(uuid, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.account_permissions(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.account_group(uuid) from public, anon, authenticated;
revoke execute on function public.account_require(uuid, uuid, bigint) from public, anon, authenticated;
revoke execute on function public.totp_default_group() from public, anon, authenticated;
revoke execute on function public.vault_info_valid(jsonb) from public, anon, authenticated;
revoke execute on function public.vault_escrow_key_id(text) from public, anon, authenticated;
revoke execute on function public.invite_invalid_reason(group_invites) from public, anon, authenticated;
revoke execute on function public.new_invite_code() from public, anon, authenticated;
revoke execute on function public.group_assert_not_encrypted(uuid) from public, anon, authenticated;
revoke execute on function public.admin_user_json(uuid) from public, anon, authenticated;
revoke execute on function public.audit_page(uuid, bigint, int, boolean, boolean) from public, anon, authenticated;
revoke execute on function public.invite_code_mask(text) from public, anon, authenticated;
revoke execute on function public.group_audit_redact(jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.activity_actor() from public, anon, authenticated;
revoke execute on function public.user_audit(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.activity_value(text) from public, anon, authenticated;
revoke execute on function public.user_activity_page(uuid, bigint, int, boolean, boolean) from public, anon, authenticated;
revoke execute on function public.login_history_page(uuid, bigint, int, boolean) from public, anon, authenticated;
revoke execute on function public.profiles_activity() from public, anon, authenticated;
revoke execute on function public.sync_signal(uuid[], text[]) from public, anon, authenticated;
revoke execute on function public.sync_group_topics(uuid, text[]) from public, anon, authenticated;
revoke execute on function public.sync_signal_group(uuid, text[]) from public, anon, authenticated;
revoke execute on function public.sync_on_groups() from public, anon, authenticated;
revoke execute on function public.sync_on_group_members() from public, anon, authenticated;
revoke execute on function public.sync_on_group_roles() from public, anon, authenticated;
revoke execute on function public.sync_on_group_member_roles() from public, anon, authenticated;
revoke execute on function public.sync_on_totp_accounts() from public, anon, authenticated;
revoke execute on function public.sync_on_totp_secrets() from public, anon, authenticated;
revoke execute on function public.sync_on_group_account_overwrites() from public, anon, authenticated;
revoke execute on function public.sync_on_group_email_invites() from public, anon, authenticated;
revoke execute on function public.sync_on_profiles_default_group() from public, anon, authenticated;
revoke execute on function public.sync_on_profiles_delete() from public, anon, authenticated;
revoke execute on function public.current_session_id() from public, anon, authenticated;
revoke execute on function public.user_sessions_json(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.session_devices_cleanup() from public, anon, authenticated;
revoke execute on function public.prune_retention() from public, anon, authenticated;
grant execute on function public.prune_retention() to service_role;
revoke execute on function public.notification_defaults() from public, anon, authenticated;
revoke execute on function public.notification_type(text) from public, anon, authenticated;
revoke execute on function public.notify_enabled(uuid, text) from public, anon, authenticated;
revoke execute on function public.notify_name(uuid) from public, anon, authenticated;
revoke execute on function public.notify_norm_link(text) from public, anon, authenticated;
revoke execute on function public.notify(uuid[], text, text, text, text, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.notify_codes_body(text, text, int, int) from public, anon, authenticated;
revoke execute on function public.notify_codes_changed(uuid, uuid, uuid[], int, int) from public, anon, authenticated;
revoke execute on function public.site_setting(text) from public, anon, authenticated;
revoke execute on function public.notify_admin_change_enabled(text) from public, anon, authenticated;
revoke execute on function public.semver_cmp(text, text) from public, anon, authenticated;
revoke execute on function public.session_devices_guard() from public, anon, authenticated;
revoke execute on function public.login_history_notify() from public, anon, authenticated;
revoke execute on function public.broadcast_filter_uuids(jsonb, int) from public, anon, authenticated;
revoke execute on function public.broadcast_targets(jsonb) from public, anon, authenticated;
revoke execute on function public.push_kick() from public, anon, authenticated;
revoke execute on function public.notifications_push_kick() from public, anon, authenticated;
revoke execute on function public.push_retry() from public, anon, authenticated;
-- 通知 RPC：先收回 public / anon（下面再 grant 給 authenticated；app_config 例外開給 anon）
revoke execute on function public.notifications_list(text, bigint, int) from public, anon;
revoke execute on function public.notifications_unread_counts() from public, anon;
revoke execute on function public.notifications_mark_read(bigint[], text) from public, anon;
revoke execute on function public.notification_prefs_get() from public, anon;
revoke execute on function public.notification_prefs_set(jsonb) from public, anon;
revoke execute on function public.register_push_token(text) from public, anon;
revoke execute on function public.admin_broadcast_preview(jsonb) from public, anon;
revoke execute on function public.admin_broadcast_send(text, text, text, text, jsonb) from public, anon;
revoke execute on function public.admin_broadcasts_list(bigint, int) from public, anon;
revoke execute on function public.admin_site_settings_get() from public, anon;
revoke execute on function public.admin_site_settings_set(text, jsonb) from public, anon;
revoke execute on function public.app_config() from public;
-- Edge Function push（service role）專用
revoke execute on function public.push_check_secret(text) from public, anon, authenticated;
revoke execute on function public.push_claim(int) from public, anon, authenticated;
revoke execute on function public.push_finish(bigint[], text[]) from public, anon, authenticated;
grant execute on function public.push_check_secret(text) to service_role;
grant execute on function public.push_claim(int) to service_role;
grant execute on function public.push_finish(bigint[], text[]) to service_role;

-- ---------- RPC：只開給登入使用者 ----------
revoke execute on function public.me_permissions() from public, anon;
revoke execute on function public.site_roles_list() from public, anon;
revoke execute on function public.site_owner() from public, anon;
revoke execute on function public.site_role_create(text, text, bigint) from public, anon;
revoke execute on function public.site_role_update(uuid, text, text, bigint) from public, anon;
revoke execute on function public.site_role_delete(uuid) from public, anon;
revoke execute on function public.site_roles_reorder(uuid[]) from public, anon;
revoke execute on function public.site_set_user_roles(uuid, uuid[]) from public, anon;
revoke execute on function public.set_username(text) from public, anon;
revoke execute on function public.username_available(text) from public, anon;
revoke execute on function public.user_public(uuid) from public, anon;
revoke execute on function public.user_public_by_username(text) from public, anon;
revoke execute on function public.ensure_profile() from public, anon;
revoke execute on function public.group_create(text, text) from public, anon;
revoke execute on function public.my_groups() from public, anon;
revoke execute on function public.my_groups_reorder(uuid[]) from public, anon;
revoke execute on function public.group_detail(uuid) from public, anon;
revoke execute on function public.group_update(uuid, text, text) from public, anon;
revoke execute on function public.group_delete(uuid) from public, anon;
revoke execute on function public.group_transfer(uuid, uuid) from public, anon;
revoke execute on function public.group_set_default(uuid) from public, anon;
revoke execute on function public.group_leave(uuid) from public, anon;
revoke execute on function public.group_kick(uuid, uuid) from public, anon;
revoke execute on function public.group_bans(uuid) from public, anon;
revoke execute on function public.group_ban(uuid, text, text) from public, anon;
revoke execute on function public.group_ban_update(uuid, uuid, text) from public, anon;
revoke execute on function public.group_unban(uuid, uuid) from public, anon;
revoke execute on function public.group_add_member(uuid, text) from public, anon;
revoke execute on function public.group_set_member_roles(uuid, uuid, uuid[]) from public, anon;
revoke execute on function public.group_role_create(uuid, text, text, bigint) from public, anon;
revoke execute on function public.group_role_update(uuid, text, text, bigint) from public, anon;
revoke execute on function public.group_role_delete(uuid) from public, anon;
revoke execute on function public.group_roles_reorder(uuid, uuid[]) from public, anon;
revoke execute on function public.group_accounts(uuid) from public, anon;
revoke execute on function public.group_account_add(uuid, jsonb) from public, anon;
revoke execute on function public.group_account_update(uuid, jsonb) from public, anon;
revoke execute on function public.group_account_delete(uuid) from public, anon;
revoke execute on function public.group_accounts_reorder(uuid, uuid[]) from public, anon;
revoke execute on function public.group_set_category_order(uuid, text[]) from public, anon;
revoke execute on function public.group_accounts_clear(uuid) from public, anon;
revoke execute on function public.group_account_secret(uuid) from public, anon;
revoke execute on function public.group_account_secrets(uuid) from public, anon;
revoke execute on function public.group_account_overwrites(uuid) from public, anon;
revoke execute on function public.group_set_overwrite(uuid, text, uuid, bigint, bigint) from public, anon;
revoke execute on function public.group_codes_permitted(uuid) from public, anon;
revoke execute on function public.totp_list() from public, anon;
revoke execute on function public.totp_add(jsonb) from public, anon;
revoke execute on function public.totp_update(text, jsonb) from public, anon;
revoke execute on function public.totp_delete(text) from public, anon;
revoke execute on function public.totp_clear() from public, anon;
revoke execute on function public.totp_reorder(text[]) from public, anon;
revoke execute on function public.totp_set_vault(jsonb, jsonb, text, text) from public, anon;
revoke execute on function public.vault_escrow_put(text) from public, anon;
revoke execute on function public.vault_escrow_needed() from public, anon;
revoke execute on function public.vault_reset() from public, anon;
revoke execute on function public.group_set_encrypted(uuid, boolean, jsonb, text) from public, anon;
revoke execute on function public.group_invite_create(uuid, int, int) from public, anon;
revoke execute on function public.group_invite_revoke(text) from public, anon;
revoke execute on function public.group_invite_info(text) from public, anon;
revoke execute on function public.group_join(text) from public, anon;
revoke execute on function public.group_invite_user(uuid, text) from public, anon;
revoke execute on function public.group_email_invite_cancel(uuid) from public, anon;
revoke execute on function public.my_invitations() from public, anon;
revoke execute on function public.respond_invitation(uuid, boolean) from public, anon;
revoke execute on function public.admin_users(text, int, int) from public, anon;
revoke execute on function public.admin_user(uuid) from public, anon;
revoke execute on function public.admin_update_user(uuid, text, text) from public, anon;
revoke execute on function public.admin_user_totp(uuid) from public, anon;
revoke execute on function public.admin_update_user_totp(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.admin_delete_user_totp(uuid, uuid) from public, anon;
revoke execute on function public.admin_can_delete_user(uuid) from public, anon;
revoke execute on function public.can_delete_self() from public, anon;
revoke execute on function public.admin_groups(text) from public, anon;
revoke execute on function public.group_audit_log(uuid, bigint, int) from public, anon;
revoke execute on function public.admin_audit_log(bigint, int) from public, anon;
revoke execute on function public.my_login_history(bigint, int) from public, anon;
revoke execute on function public.my_account_activity(bigint, int) from public, anon;
revoke execute on function public.admin_user_login_history(uuid, bigint, int) from public, anon;
revoke execute on function public.admin_user_activity(uuid, bigint, int) from public, anon;
revoke execute on function public.list_my_sessions() from public, anon;
revoke execute on function public.revoke_my_session(uuid) from public, anon;
revoke execute on function public.admin_user_sessions(uuid) from public, anon;

grant execute on function public.me_permissions() to authenticated;
grant execute on function public.site_roles_list() to authenticated;
grant execute on function public.site_owner() to authenticated;
grant execute on function public.site_role_create(text, text, bigint) to authenticated;
grant execute on function public.site_role_update(uuid, text, text, bigint) to authenticated;
grant execute on function public.site_role_delete(uuid) to authenticated;
grant execute on function public.site_roles_reorder(uuid[]) to authenticated;
grant execute on function public.site_set_user_roles(uuid, uuid[]) to authenticated;
grant execute on function public.set_username(text) to authenticated;
grant execute on function public.username_available(text) to authenticated;
grant execute on function public.user_public(uuid) to authenticated;
grant execute on function public.user_public_by_username(text) to authenticated;
grant execute on function public.ensure_profile() to authenticated;
grant execute on function public.group_create(text, text) to authenticated;
grant execute on function public.my_groups() to authenticated;
grant execute on function public.my_groups_reorder(uuid[]) to authenticated;
grant execute on function public.group_detail(uuid) to authenticated;
grant execute on function public.group_update(uuid, text, text) to authenticated;
grant execute on function public.group_delete(uuid) to authenticated;
grant execute on function public.group_transfer(uuid, uuid) to authenticated;
grant execute on function public.group_set_default(uuid) to authenticated;
grant execute on function public.group_leave(uuid) to authenticated;
grant execute on function public.group_kick(uuid, uuid) to authenticated;
grant execute on function public.group_bans(uuid) to authenticated;
grant execute on function public.group_ban(uuid, text, text) to authenticated;
grant execute on function public.group_ban_update(uuid, uuid, text) to authenticated;
grant execute on function public.group_unban(uuid, uuid) to authenticated;
grant execute on function public.group_add_member(uuid, text) to authenticated;
grant execute on function public.group_set_member_roles(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.group_role_create(uuid, text, text, bigint) to authenticated;
grant execute on function public.group_role_update(uuid, text, text, bigint) to authenticated;
grant execute on function public.group_role_delete(uuid) to authenticated;
grant execute on function public.group_roles_reorder(uuid, uuid[]) to authenticated;
grant execute on function public.group_accounts(uuid) to authenticated;
grant execute on function public.group_account_add(uuid, jsonb) to authenticated;
grant execute on function public.group_account_update(uuid, jsonb) to authenticated;
grant execute on function public.group_account_delete(uuid) to authenticated;
grant execute on function public.group_accounts_reorder(uuid, uuid[]) to authenticated;
grant execute on function public.group_set_category_order(uuid, text[]) to authenticated;
grant execute on function public.group_accounts_clear(uuid) to authenticated;
grant execute on function public.group_account_secret(uuid) to authenticated;
grant execute on function public.group_account_secrets(uuid) to authenticated;
grant execute on function public.group_account_overwrites(uuid) to authenticated;
grant execute on function public.group_set_overwrite(uuid, text, uuid, bigint, bigint) to authenticated;
grant execute on function public.group_codes_permitted(uuid) to authenticated;
grant execute on function public.totp_list() to authenticated;
grant execute on function public.totp_add(jsonb) to authenticated;
grant execute on function public.totp_update(text, jsonb) to authenticated;
grant execute on function public.totp_delete(text) to authenticated;
grant execute on function public.totp_clear() to authenticated;
grant execute on function public.totp_reorder(text[]) to authenticated;
grant execute on function public.totp_set_vault(jsonb, jsonb, text, text) to authenticated;
grant execute on function public.vault_escrow_put(text) to authenticated;
grant execute on function public.vault_escrow_needed() to authenticated;
grant execute on function public.vault_reset() to authenticated;
grant execute on function public.group_set_encrypted(uuid, boolean, jsonb, text) to authenticated;
grant execute on function public.group_invite_create(uuid, int, int) to authenticated;
grant execute on function public.group_invite_revoke(text) to authenticated;
grant execute on function public.group_invite_info(text) to authenticated;
grant execute on function public.group_join(text) to authenticated;
grant execute on function public.group_invite_user(uuid, text) to authenticated;
grant execute on function public.group_email_invite_cancel(uuid) to authenticated;
grant execute on function public.my_invitations() to authenticated;
grant execute on function public.respond_invitation(uuid, boolean) to authenticated;
grant execute on function public.admin_users(text, int, int) to authenticated;
grant execute on function public.admin_user(uuid) to authenticated;
grant execute on function public.admin_update_user(uuid, text, text) to authenticated;
grant execute on function public.admin_user_totp(uuid) to authenticated;
grant execute on function public.admin_update_user_totp(uuid, uuid, jsonb) to authenticated;
grant execute on function public.admin_delete_user_totp(uuid, uuid) to authenticated;
grant execute on function public.admin_can_delete_user(uuid) to authenticated;
grant execute on function public.can_delete_self() to authenticated;
grant execute on function public.admin_groups(text) to authenticated;
grant execute on function public.group_audit_log(uuid, bigint, int) to authenticated;
grant execute on function public.admin_audit_log(bigint, int) to authenticated;
grant execute on function public.my_login_history(bigint, int) to authenticated;
grant execute on function public.my_account_activity(bigint, int) to authenticated;
grant execute on function public.admin_user_login_history(uuid, bigint, int) to authenticated;
grant execute on function public.admin_user_activity(uuid, bigint, int) to authenticated;
grant execute on function public.list_my_sessions() to authenticated;
grant execute on function public.revoke_my_session(uuid) to authenticated;
grant execute on function public.admin_user_sessions(uuid) to authenticated;
grant execute on function public.notifications_list(text, bigint, int) to authenticated;
grant execute on function public.notifications_unread_counts() to authenticated;
grant execute on function public.notifications_mark_read(bigint[], text) to authenticated;
grant execute on function public.notification_prefs_get() to authenticated;
grant execute on function public.notification_prefs_set(jsonb) to authenticated;
grant execute on function public.register_push_token(text) to authenticated;
grant execute on function public.admin_broadcast_preview(jsonb) to authenticated;
grant execute on function public.admin_broadcast_send(text, text, text, text, jsonb) to authenticated;
grant execute on function public.admin_broadcasts_list(bigint, int) to authenticated;
grant execute on function public.admin_site_settings_get() to authenticated;
grant execute on function public.admin_site_settings_set(text, jsonb) to authenticated;

-- ---------- RPC：不用登入也能呼叫 ----------

-- App 開啟時讀最低版本（鎖定畫面、還沒登入時也要讀得到）
grant execute on function public.app_config() to anon, authenticated;


-- ============================================================
-- 17. 種子資料（含 Storage bucket、推播用的 Vault secret 與排程）
-- ============================================================

-- 全站身分組：@everyone（CREATE_GROUPS）與「管理員」（ADMINISTRATOR）；固定 id
insert into public.site_roles (id, name, color, position, permissions, is_default)
values
  ('00000000-0000-0000-0000-000000000000', '@everyone', '', 0, 256, true),
  ('00000000-0000-0000-0000-000000000001', '管理員', '#e11d48', 100, 1, false);

-- 全站擁有者：固定一列，一開始沒有人（設定方式見「18.」）
insert into public.site_owner (id) values (true);

-- ---------- Storage ----------
-- 大頭照與背景圖：公開 bucket avatars（只有 service role 的 /api/profile/photo 寫入，不建使用者的 storage policy）。
-- 圖片由網站的 /media/<path> 轉到 Storage 的公開網址，資料庫不寫死 Supabase 的網址。
-- 沒有 storage schema 的環境（例如本機 PGlite 測試）略過
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict do nothing;
  end if;
end;
$$;

-- ---------- 通知 ----------
-- 全站設定的預設值：後台修改帳號時三種通知都開、沒有最低 App 版本
insert into public.site_settings (key, value) values
  ('notify_admin_changes', '{"role": true, "username": true, "codes": true}'::jsonb),
  ('min_app_version', 'null'::jsonb)
on conflict (key) do nothing;

-- 推播：資料庫呼叫 Edge Function 用的密語存進 Supabase Vault（已經有就不動）。
-- project_url 不放在這裡（網址不進 repo），請自己在 SQL Editor 執行一次：
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
-- 沒有 Vault 的環境（例如本機 PGlite 測試）略過
do $$
begin
  if to_regclass('vault.secrets') is not null then
    if not exists (select 1 from vault.secrets where name = 'push_webhook_secret') then
      perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'push_webhook_secret',
                                  'Securibit：資料庫呼叫 Edge Function push 時帶的 x-push-secret');
    end if;
  end if;
exception when others then
  raise notice '無法建立 push_webhook_secret：%', sqlerrm;
end;
$$;

-- 推播補送：有 pg_cron 時每分鐘執行 push_retry()（同名的排程會被更新）；沒有 pg_cron 就略過
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$select cron.schedule('securibit-push-retry', '* * * * *', 'select public.push_retry()')$q$;
  end if;
exception when others then
  raise notice '無法排程推播補送：%', sqlerrm;
end;
$$;


-- ============================================================
-- 18. （選用）指定第一位管理員與全站擁有者
-- 新專案一開始沒有任何人擁有「管理員」身分組，也沒有全站擁有者，請把下面的 email 換成你的，取消註解後執行一次。
-- - 還沒註冊：先記在 site_pending_roles，等這個 email 第一次登入、而且 email 已驗證
--   （例如 Google 登入，或點過驗證信）時，由 ensure_profile → claim_verified_email → apply_pending_roles 自動套上。
-- - 已經註冊過：直接寫進 site_user_roles（也可以照樣用 site_pending_roles，下次登入時套上）。
-- email 一律用小寫。
-- ============================================================

-- insert into public.site_pending_roles (email, role_id)
-- values ('you@example.com', '00000000-0000-0000-0000-000000000001')
-- on conflict do nothing;

-- insert into public.site_user_roles (user_id, role_id)
-- select p.id, '00000000-0000-0000-0000-000000000001'
-- from public.profiles p
-- join auth.users u on u.id = p.id
-- where lower(u.email) = 'you@example.com'
-- on conflict do nothing;

-- 全站擁有者（只能有一位）：還沒註冊就記成 pending_email，等這個 email 第一次登入且已驗證時接上；已經註冊過就直接設定
-- update public.site_owner set pending_email = 'you@example.com' where user_id is null;

-- update public.site_owner
-- set user_id = (select p.id from public.profiles p join auth.users u on u.id = p.id
--                where lower(u.email) = 'you@example.com' limit 1),
--     pending_email = null;
