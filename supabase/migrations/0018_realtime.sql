-- ============================================================
-- App 即時同步（0017 之後執行）
-- 1. sync_signals：每位使用者「哪裡變了」的訊號，一列一個 topic，只存時間，不存任何群組或驗證碼的內容：
--      'groups'            群組清單（名稱、說明、擁有者、加密、成員數、驗證碼數、我的權限、我排的順序、預設群組）
--      'invitations'       寄給我（email）的群組邀請
--      'codes:<群組 id>'   這個群組的驗證碼清單與權限（不含金鑰）
--      'secrets:<群組 id>' 這個群組的金鑰
--    App 用 Realtime 訂閱自己的列，收到後照原本的 RPC 重新讀取，解密、權限與排序都照舊。
-- 2. 為什麼不直接讓 Realtime 訂閱 groups / group_members / totp_accounts…：
--    那些表 0008 / 0009 開了 RLS、不建 policy，也 revoke 了 authenticated 的 select，讀寫一律走 security definer 的 RPC。
--    Realtime 的 postgres_changes 要訂閱者對資料表有 select 權限、並通過 RLS 才會送事件；為了 Realtime 開放的話，
--    使用者就能用 REST 直接讀這些表，繞過 RPC 裡的權限檢查（例如單筆驗證碼「查看驗證碼」的拒絕覆寫），
--    totp_secrets 更不能開放。所以改由觸發器把變更寫到 sync_signals（扇出給相關的人），只開放這一張表：
--    authenticated 只能 select，policy 只看得到自己的列（user_id = auth.uid()，不依賴任何函式）。
-- 3. 觸發器（after、for each row、security definer）：
--      groups 修改                            → 全體成員 groups
--      group_members 新增 / 刪除              → 全體成員與本人 groups（刪除時順便刪掉本人在這個群組的 codes / secrets 列）
--      group_members 修改（自己排順序）       → 本人 groups
--      group_roles 任何變更                   → 全體成員 groups、codes
--      group_member_roles 新增 / 刪除         → 本人 groups、codes
--      totp_accounts 新增 / 刪除              → 全體成員 groups、codes；修改 → 全體成員 codes
--      totp_secrets 任何變更                  → 全體成員 secrets
--      group_account_overwrites 任何變更      → 全體成員 groups、codes
--      group_email_invites 新增 / 刪除        → 被邀請的 email 那位使用者 invitations
--      profiles.default_group_id 變更         → 本人 groups
--      刪除 profile                           → 刪掉本人的全部訊號
--    群組刪除時 cascade 刪掉成員、身分組、驗證碼，各自的觸發器會通知到。
--    全站身分組（site_roles / site_user_roles）的變動不通知，App 每 60 秒的輪詢會補上。
-- 4. 同一個交易裡同一列只寫一次：changed_at = transaction_timestamp()，已經是這個值就不更新，
--    批次操作（重新排序、清空、整批匯入、開關加密改寫金鑰）每個人每個 topic 只送一個事件。
-- 5. 不要手動刪 sync_signals 的列：Realtime 的 DELETE 事件不套用 RLS（App 也只訂閱 INSERT / UPDATE），
--    主鍵用流水號，舊資料只帶 id，不會洩漏 user_id 或 topic。
-- 6. sync_signals 加進 supabase_realtime publication。
-- 可重複執行。
-- ============================================================

-- ============================================================
-- 資料表
-- ============================================================
create table if not exists public.sync_signals (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,                             -- 不設 FK：刪 profile 時由觸發器清掉，避免 cascade 順序擋到刪帳號
  topic      text not null,
  changed_at timestamptz not null default now(),
  unique (user_id, topic)
);

alter table public.sync_signals enable row level security;
revoke all on table public.sync_signals from anon, authenticated;
grant select on table public.sync_signals to authenticated;
grant select, insert, update, delete on table public.sync_signals to service_role;

drop policy if exists "sync_signals_select_own" on public.sync_signals;
create policy "sync_signals_select_own"
  on public.sync_signals for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ============================================================
-- 內部 helper（只給觸發器用）
-- ============================================================

-- 通知 uids 的每一位 × topics 的每一個；已刪除的 profile 不寫（刪帳號的 cascade 途中）
create or replace function public.sync_signal(p_uids uuid[], p_topics text[])
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
create or replace function public.sync_group_topics(p_gid uuid, p_kinds text[])
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
create or replace function public.sync_signal_group(p_gid uuid, p_kinds text[])
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

-- ============================================================
-- 觸發器
-- ============================================================

-- 群組：名稱、說明、擁有者、加密
create or replace function public.sync_on_groups()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform sync_signal_group(new.id, array['groups']);
  return null;
end;
$$;

drop trigger if exists sync_signals_groups on public.groups;
create trigger sync_signals_groups
  after update on public.groups
  for each row
  when (old.* is distinct from new.*)
  execute function public.sync_on_groups();

-- 成員：加入、離開（成員數、群組出現或消失）；修改只有自己排的順序
create or replace function public.sync_on_group_members()
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

drop trigger if exists sync_signals_group_members on public.group_members;
create trigger sync_signals_group_members
  after insert or delete on public.group_members
  for each row execute function public.sync_on_group_members();

drop trigger if exists sync_signals_group_members_update on public.group_members;
create trigger sync_signals_group_members_update
  after update on public.group_members
  for each row
  when (old.* is distinct from new.*)
  execute function public.sync_on_group_members();

-- 身分組：權限變了，全體成員的群組權限與每筆驗證碼的權限都可能變
create or replace function public.sync_on_group_roles()
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

drop trigger if exists sync_signals_group_roles on public.group_roles;
create trigger sync_signals_group_roles
  after insert or update or delete on public.group_roles
  for each row execute function public.sync_on_group_roles();

-- 成員的身分組：只影響這位成員的權限
create or replace function public.sync_on_group_member_roles()
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

drop trigger if exists sync_signals_group_member_roles on public.group_member_roles;
create trigger sync_signals_group_member_roles
  after insert or update or delete on public.group_member_roles
  for each row execute function public.sync_on_group_member_roles();

-- 驗證碼（不含金鑰）：新增、刪除也會改到群組清單的驗證碼數；個人驗證碼（group_id 為 null 的舊資料）不通知
create or replace function public.sync_on_totp_accounts()
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

drop trigger if exists sync_signals_totp_accounts on public.totp_accounts;
create trigger sync_signals_totp_accounts
  after insert or delete on public.totp_accounts
  for each row execute function public.sync_on_totp_accounts();

drop trigger if exists sync_signals_totp_accounts_update on public.totp_accounts;
create trigger sync_signals_totp_accounts_update
  after update on public.totp_accounts
  for each row
  when (old.* is distinct from new.*)
  execute function public.sync_on_totp_accounts();

-- 金鑰：刪除驗證碼時 cascade 刪掉的金鑰找不到驗證碼，由 totp_accounts 的觸發器通知
create or replace function public.sync_on_totp_secrets()
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

drop trigger if exists sync_signals_totp_secrets on public.totp_secrets;
create trigger sync_signals_totp_secrets
  after insert or delete on public.totp_secrets
  for each row execute function public.sync_on_totp_secrets();

drop trigger if exists sync_signals_totp_secrets_update on public.totp_secrets;
create trigger sync_signals_totp_secrets_update
  after update on public.totp_secrets
  for each row
  when (old.* is distinct from new.*)
  execute function public.sync_on_totp_secrets();

-- 單筆驗證碼的覆寫：每筆的權限與群組清單的驗證碼數都可能變
create or replace function public.sync_on_group_account_overwrites()
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

drop trigger if exists sync_signals_group_account_overwrites on public.group_account_overwrites;
create trigger sync_signals_group_account_overwrites
  after insert or update or delete on public.group_account_overwrites
  for each row execute function public.sync_on_group_account_overwrites();

-- Email / @ID 邀請：通知 email 對得上的使用者（同 my_invitations 用的 user_email）
create or replace function public.sync_on_group_email_invites()
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

drop trigger if exists sync_signals_group_email_invites on public.group_email_invites;
create trigger sync_signals_group_email_invites
  after insert or update or delete on public.group_email_invites
  for each row execute function public.sync_on_group_email_invites();

-- 預設群組換了（my_groups 的 is_default）
create or replace function public.sync_on_profiles_default_group()
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

drop trigger if exists sync_signals_profiles_default_group on public.profiles;
create trigger sync_signals_profiles_default_group
  after update of default_group_id on public.profiles
  for each row
  when (old.default_group_id is distinct from new.default_group_id)
  execute function public.sync_on_profiles_default_group();

-- 刪帳號：清掉本人的訊號（刪帳號前 profiles_delete_owned_groups 刪群組時可能才剛寫進來）
create or replace function public.sync_on_profiles_delete()
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

drop trigger if exists sync_signals_profiles_delete on public.profiles;
create trigger sync_signals_profiles_delete
  after delete on public.profiles
  for each row execute function public.sync_on_profiles_delete();

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

-- ============================================================
-- Realtime publication
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  -- FOR ALL TABLES 的 publication 已經包含這張表，pg_publication_tables 查得到就不加
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sync_signals'
  ) then
    alter publication supabase_realtime add table public.sync_signals;
  end if;
end;
$$;
