-- ============================================================
-- 使用者 @ID + 驗證碼資料表
-- 驗證碼從 profiles.totp（jsonb）拆成 totp_accounts + totp_secrets：
--   個人（owner_id 有值）與群組（group_id 有值，0009 再加 FK）共用，
--   金鑰獨立一張表，才能做到「看得到驗證碼、拿不到金鑰」。
-- 兩張表開 RLS 且不建 policy，讀寫一律走下面的 security definer RPC。
-- 可重複執行。
-- ============================================================

-- ---------- 補齊前面 migration 加的欄位（0002 / 0004 / 0007 沒跑過也能用）----------
alter table public.profiles
  add column if not exists migrated            boolean not null default false,
  add column if not exists migration_notified  boolean not null default false,
  add column if not exists last_login_at       timestamptz,
  add column if not exists last_login_ip       text,
  add column if not exists last_login_device   text,
  add column if not exists vault               jsonb;

-- ---------- profiles 加 @ID（存小寫）----------
alter table public.profiles add column if not exists username text;
create unique index if not exists profiles_username_key on public.profiles (username);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_format') then
    alter table public.profiles add constraint profiles_username_format
      check (username is null or username ~ '^[a-z0-9_.]{3,32}$');
  end if;
end;
$$;

-- ---------- 驗證碼資料表 ----------
create table if not exists public.totp_accounts (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid references public.profiles (id) on delete cascade,
  group_id   uuid,                                      -- 0009 再加 FK 到 groups
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
  check ((owner_id is null) <> (group_id is null))
);
create index if not exists totp_accounts_owner_position_idx on public.totp_accounts (owner_id, position);
create index if not exists totp_accounts_group_position_idx on public.totp_accounts (group_id, position);

create table if not exists public.totp_secrets (
  account_id uuid primary key references public.totp_accounts (id) on delete cascade,
  secret     text not null                              -- Base32，或個人加密後的 enc:v1:...
);

alter table public.totp_accounts enable row level security;
alter table public.totp_secrets enable row level security;
revoke all on table public.totp_accounts from anon, authenticated;
revoke all on table public.totp_secrets from anon, authenticated;
-- service_role（Next.js API route）要能直接讀金鑰產碼
grant select, insert, update, delete on table public.totp_accounts to service_role;
grant select, insert, update, delete on table public.totp_secrets to service_role;

-- ============================================================
-- 內部 helper（只給 security definer 函式用，一般使用者不能直接呼叫）
-- ============================================================

-- jsonb 欄位值 → 合法的位數 / 週期 / 演算法；不合法時用 fallback
create or replace function public.totp_norm_digits(v jsonb, fallback int)
returns int
language sql
immutable
as $$
  select case when v is not null and jsonb_typeof(v) in ('number', 'string') and (v #>> '{}') in ('6', '8')
              then (v #>> '{}')::int else fallback end;
$$;

create or replace function public.totp_norm_period(v jsonb, fallback int)
returns int
language sql
immutable
as $$
  select case when v is not null and jsonb_typeof(v) in ('number', 'string') and (v #>> '{}') in ('30', '60')
              then (v #>> '{}')::int else fallback end;
$$;

create or replace function public.totp_norm_algorithm(v jsonb, fallback text)
returns text
language sql
immutable
as $$
  select case when v is not null and jsonb_typeof(v) = 'string' and (v #>> '{}') in ('SHA-1', 'SHA-256', 'SHA-512')
              then v #>> '{}' else fallback end;
$$;

-- jsonb 值 → boolean（true / "true" 才算 true）；null 時用 fallback
create or replace function public.totp_norm_bool(v jsonb, fallback boolean)
returns boolean
language sql
immutable
as $$
  select case when v is null or jsonb_typeof(v) = 'null' then fallback
              else lower(v #>> '{}') = 'true' end;
$$;

-- jsonb 值 → 文字（null / 缺少時用 fallback）
create or replace function public.totp_norm_text(v jsonb, fallback text)
returns text
language sql
immutable
as $$
  select case when v is null or jsonb_typeof(v) = 'null' then fallback else v #>> '{}' end;
$$;

-- 把 jsonb 陣列（TotpItem / TotpInput）接在個人或群組清單的最後面；回傳新增的 id（依陣列順序）
-- id 是合法 uuid 且還沒被用過就沿用，否則重新產生；欄位不合法時用預設值
create or replace function public.totp_import_items(p_owner uuid, p_group uuid, p_items jsonb, p_created_by uuid)
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

-- 套用 patch 到一筆驗證碼（只改 patch 裡有的欄位；secret 寫到 totp_secrets）
create or replace function public.totp_apply_patch(p_account uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return;
  end if;

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
create or replace function public.totp_reorder_items(p_owner uuid, p_group uuid, p_ids text[])
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
create or replace function public.totp_items_json(p_owner uuid)
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
create or replace function public.totp_current_owner()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id from profiles p where p.id = auth.uid();
$$;

revoke execute on function public.totp_norm_digits(jsonb, int) from public, anon, authenticated;
revoke execute on function public.totp_norm_period(jsonb, int) from public, anon, authenticated;
revoke execute on function public.totp_norm_algorithm(jsonb, text) from public, anon, authenticated;
revoke execute on function public.totp_norm_bool(jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.totp_norm_text(jsonb, text) from public, anon, authenticated;
revoke execute on function public.totp_import_items(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.totp_apply_patch(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.totp_reorder_items(uuid, uuid, text[]) from public, anon, authenticated;
revoke execute on function public.totp_items_json(uuid) from public, anon, authenticated;
revoke execute on function public.totp_current_owner() from public, anon, authenticated;

-- ============================================================
-- 搬資料：profiles.totp（jsonb）→ totp_accounts + totp_secrets
-- ============================================================
do $$
declare
  p record;
begin
  for p in
    select id, totp from public.profiles
    where jsonb_typeof(totp) = 'array' and jsonb_array_length(totp) > 0
  loop
    perform public.totp_import_items(p.id, null, p.totp, p.id);
    update public.profiles set totp = '[]'::jsonb where id = p.id;
  end loop;
end;
$$;

-- 之後寫進 profiles.totp 的資料自動轉存（接回 Firestore 舊資料、舊版前端寫入）
create or replace function public.profiles_totp_to_accounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.totp is not null and jsonb_typeof(new.totp) = 'array' and jsonb_array_length(new.totp) > 0 then
    perform totp_import_items(new.id, null, new.totp, new.id);
    update profiles set totp = '[]'::jsonb where id = new.id;
  end if;
  return null;
end;
$$;

revoke execute on function public.profiles_totp_to_accounts() from public, anon, authenticated;

drop trigger if exists profiles_totp_to_accounts on public.profiles;
create trigger profiles_totp_to_accounts
  after insert or update of totp on public.profiles
  for each row execute function public.profiles_totp_to_accounts();

-- ============================================================
-- 個人驗證碼 RPC（名稱、參數沿用 0006 / 0007）
-- 只動 auth.uid() 自己的資料，回傳整個清單；未登入回傳 null
-- ============================================================

-- 讀取自己的全部驗證碼
create or replace function public.totp_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := totp_current_owner();
begin
  if uid is null then
    return null;
  end if;
  return totp_items_json(uid);
end;
$$;

-- 新增（陣列；每筆可帶 id，沒帶就產生），接在最後
create or replace function public.totp_add(items jsonb)
returns jsonb
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
  perform totp_import_items(uid, null, totp_add.items, uid);
  return totp_items_json(uid);
end;
$$;

-- 只改 patch 裡有的欄位；找不到該筆回傳 null
create or replace function public.totp_update(item_id text, patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := totp_current_owner();
  target uuid;
begin
  if uid is null then
    return null;
  end if;
  select a.id into target from totp_accounts a
  where a.owner_id = uid and a.id::text = lower(trim(totp_update.item_id));
  if target is null then
    return null;
  end if;
  perform totp_apply_patch(target, totp_update.patch);
  return totp_items_json(uid);
end;
$$;

-- 刪除一筆
create or replace function public.totp_delete(item_id text)
returns jsonb
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
  delete from totp_accounts a
  where a.owner_id = uid and a.id::text = lower(trim(totp_delete.item_id));
  return totp_items_json(uid);
end;
$$;

-- 全部刪除
create or replace function public.totp_clear()
returns jsonb
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
  delete from totp_accounts a where a.owner_id = uid;
  return '[]'::jsonb;
end;
$$;

-- 依 ids 重排，不在 ids 裡的照原順序接在後面
create or replace function public.totp_reorder(ids text[])
returns jsonb
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
  perform totp_reorder_items(uid, null, totp_reorder.ids);
  return totp_items_json(uid);
end;
$$;

-- 更新 profiles.vault 並一次換掉多筆金鑰（secrets：{ "<id>": "<secret>" }），回傳清單
create or replace function public.totp_set_vault(new_vault jsonb, secrets jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := totp_current_owner();
  s jsonb := totp_set_vault.secrets;
begin
  if uid is null then
    return null;
  end if;

  update profiles
  set vault = nullif(totp_set_vault.new_vault, 'null'::jsonb),
      updated_at = now()
  where id = uid;

  if s is not null and jsonb_typeof(s) = 'object' then
    update totp_secrets t
    set secret = s ->> a.id::text
    from totp_accounts a
    where a.id = t.account_id
      and a.owner_id = uid
      and s ? a.id::text
      and jsonb_typeof(s -> a.id::text) = 'string';
  end if;

  return totp_items_json(uid);
end;
$$;

revoke execute on function public.totp_list() from public, anon;
revoke execute on function public.totp_add(jsonb) from public, anon;
revoke execute on function public.totp_update(text, jsonb) from public, anon;
revoke execute on function public.totp_delete(text) from public, anon;
revoke execute on function public.totp_clear() from public, anon;
revoke execute on function public.totp_reorder(text[]) from public, anon;
revoke execute on function public.totp_set_vault(jsonb, jsonb) from public, anon;

grant execute on function public.totp_list() to authenticated;
grant execute on function public.totp_add(jsonb) to authenticated;
grant execute on function public.totp_update(text, jsonb) to authenticated;
grant execute on function public.totp_delete(text) to authenticated;
grant execute on function public.totp_clear() to authenticated;
grant execute on function public.totp_reorder(text[]) to authenticated;
grant execute on function public.totp_set_vault(jsonb, jsonb) to authenticated;

-- ============================================================
-- @ID
-- ============================================================

-- 保留字（不能當 @ID）
create or replace function public.username_reserved(v text)
returns boolean
language sql
immutable
as $$
  select v = any (array['admin', 'administrator', 'root', 'system', 'securibit', 'everyone',
                        'here', 'support', 'help', 'null', 'undefined']);
$$;

-- 正規化：轉小寫、trim、去掉開頭的 @；空字串回傳 null（代表清除）
create or replace function public.username_normalize(v text)
returns text
language sql
immutable
as $$
  select nullif(trim(regexp_replace(lower(trim(coalesce(v, ''))), '^@', '')), '');
$$;

-- 檢查 @ID 能不能給 p_uid 使用（已正規化、不是 null）；不行就 raise
create or replace function public.username_assert(v text, p_uid uuid)
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
  if username_reserved(v) then
    raise exception '這個 @ID 是保留字，不能使用';
  end if;
  if exists (select 1 from profiles where username = v and id is distinct from p_uid) then
    raise exception '這個 @ID 已被使用';
  end if;
end;
$$;

revoke execute on function public.username_reserved(text) from public, anon, authenticated;
revoke execute on function public.username_normalize(text) from public, anon, authenticated;
revoke execute on function public.username_assert(text, uuid) from public, anon, authenticated;

-- 直接改 profiles（RLS 允許改自己那列）也不能用保留字
create or replace function public.profiles_username_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.username is not null
     and (tg_op = 'INSERT' or new.username is distinct from old.username)
     and username_reserved(new.username) then
    raise exception '這個 @ID 是保留字，不能使用';
  end if;
  return new;
end;
$$;

revoke execute on function public.profiles_username_guard() from public, anon, authenticated;

drop trigger if exists profiles_username_guard on public.profiles;
create trigger profiles_username_guard
  before insert or update of username on public.profiles
  for each row execute function public.profiles_username_guard();

-- 設定自己的 @ID；null 或空字串代表清除；回傳存進去的值
create or replace function public.set_username(new_username text)
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
create or replace function public.username_available(name text)
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

revoke execute on function public.set_username(text) from public, anon;
revoke execute on function public.username_available(text) from public, anon;
grant execute on function public.set_username(text) to authenticated;
grant execute on function public.username_available(text) to authenticated;
