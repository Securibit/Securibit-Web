-- ============================================================
-- 群組、身分組與後台（規格：docs/groups-and-permissions.md）
-- - 全站身分組：Discord 式 bitfield，多身分組權限 OR，有 @everyone、有階層
-- - 群組：等於 Discord 的伺服器；群組裡的每筆驗證碼等於頻道，可設定允許 / 拒絕覆寫
-- 所有資料表開 RLS 且不建 policy，讀寫一律走 security definer 的 RPC，權限在函式裡檢查。
-- 可重複執行。
--
-- 全站權限：1 ADMINISTRATOR、2 VIEW_ADMIN、4 VIEW_USERS、8 MANAGE_USERS、16 VIEW_USER_TOTP、
--           32 MANAGE_USER_TOTP、64 MANAGE_ROLES、128 VIEW_AUDIT_LOG、256 CREATE_GROUPS、512 MANAGE_GROUPS
--           SITE_ALL = 1023
-- 群組權限：1 ADMINISTRATOR、2 VIEW_CODES、4 VIEW_SECRETS、8 MANAGE_CODES、16 CREATE_INVITE、
--           32 KICK_MEMBERS、64 MANAGE_ROLES、128 MANAGE_GROUP、256 VIEW_AUDIT_LOG
--           GROUP_ALL = 511，可覆寫 GROUP_OVERWRITABLE = 14
-- ============================================================

-- ---------- 補齊前面 migration 加的欄位（0002 / 0004 / 0007 沒跑過也能用）----------
alter table public.profiles
  add column if not exists migrated            boolean not null default false,
  add column if not exists migration_notified  boolean not null default false,
  add column if not exists last_login_at       timestamptz,
  add column if not exists last_login_ip       text,
  add column if not exists last_login_device   text,
  add column if not exists vault               jsonb;

-- ============================================================
-- 資料表
-- ============================================================

-- 全站身分組
create table if not exists public.site_roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  color       text not null default '',               -- '#rrggbb' 或空字串（無顏色）
  position    int  not null default 0,
  permissions bigint not null default 0,
  is_default  boolean not null default false,          -- @everyone，只有一個
  created_at  timestamptz not null default now()
);
create unique index if not exists site_roles_one_default on public.site_roles ((true)) where is_default;

create table if not exists public.site_user_roles (
  user_id uuid references public.profiles (id) on delete cascade,
  role_id uuid references public.site_roles (id) on delete cascade,
  primary key (user_id, role_id)
);
create index if not exists site_user_roles_role_idx on public.site_user_roles (role_id);

-- 還沒註冊的人先記著，第一次登入（ensure_profile）時套上
create table if not exists public.site_pending_roles (
  email   text not null,                               -- 小寫
  role_id uuid references public.site_roles (id) on delete cascade,
  primary key (email, role_id)
);

-- 群組
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 50),
  description text not null default '' check (char_length(description) <= 300),
  owner_id    uuid not null references public.profiles (id),
  created_at  timestamptz not null default now()
);
create index if not exists groups_owner_idx on public.groups (owner_id);

create table if not exists public.group_roles (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  name        text not null,
  color       text not null default '',
  position    int  not null default 0,
  permissions bigint not null default 0,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists group_roles_group_idx on public.group_roles (group_id, position);
create unique index if not exists group_roles_one_default on public.group_roles (group_id) where is_default;

create table if not exists public.group_members (
  group_id  uuid references public.groups (id) on delete cascade,
  user_id   uuid references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members (user_id);

create table if not exists public.group_member_roles (
  group_id uuid,
  user_id  uuid,
  role_id  uuid references public.group_roles (id) on delete cascade,
  primary key (group_id, user_id, role_id),
  foreign key (group_id, user_id) references public.group_members (group_id, user_id) on delete cascade
);
create index if not exists group_member_roles_role_idx on public.group_member_roles (role_id);

-- 邀請連結
create table if not exists public.group_invites (
  code       text primary key,                         -- 10 碼英數
  group_id   uuid not null references public.groups (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,                              -- null = 不過期
  max_uses   int,                                      -- null = 不限
  uses       int not null default 0,
  revoked_at timestamptz
);
create index if not exists group_invites_group_idx on public.group_invites (group_id);

-- Email / @ID 邀請（對方接受或拒絕後刪除）
create table if not exists public.group_email_invites (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  email      text not null,                            -- 小寫
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (group_id, email)
);
create index if not exists group_email_invites_email_idx on public.group_email_invites (email);

-- 單筆驗證碼覆寫
create table if not exists public.group_account_overwrites (
  account_id  uuid references public.totp_accounts (id) on delete cascade,
  target_type text check (target_type in ('role', 'member')),
  target_id   uuid,                                    -- group_roles.id 或 profiles.id
  allow       bigint not null default 0,
  deny        bigint not null default 0,
  primary key (account_id, target_type, target_id)
);

-- 操作紀錄
create table if not exists public.audit_logs (
  id          bigint generated always as identity primary key,
  group_id    uuid references public.groups (id) on delete cascade, -- null = 全站
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,                           -- 例如 'group.role.update'
  target_type text,
  target_id   text,
  detail      jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists audit_logs_group_idx on public.audit_logs (group_id, id desc);

-- totp_accounts.group_id → groups
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'totp_accounts_group_id_fkey') then
    alter table public.totp_accounts add constraint totp_accounts_group_id_fkey
      foreign key (group_id) references public.groups (id) on delete cascade;
  end if;
end;
$$;

-- ---------- RLS / 表權限 ----------
alter table public.site_roles enable row level security;
alter table public.site_user_roles enable row level security;
alter table public.site_pending_roles enable row level security;
alter table public.groups enable row level security;
alter table public.group_roles enable row level security;
alter table public.group_members enable row level security;
alter table public.group_member_roles enable row level security;
alter table public.group_invites enable row level security;
alter table public.group_email_invites enable row level security;
alter table public.group_account_overwrites enable row level security;
alter table public.audit_logs enable row level security;

revoke all on table public.site_roles from anon, authenticated;
revoke all on table public.site_user_roles from anon, authenticated;
revoke all on table public.site_pending_roles from anon, authenticated;
revoke all on table public.groups from anon, authenticated;
revoke all on table public.group_roles from anon, authenticated;
revoke all on table public.group_members from anon, authenticated;
revoke all on table public.group_member_roles from anon, authenticated;
revoke all on table public.group_invites from anon, authenticated;
revoke all on table public.group_email_invites from anon, authenticated;
revoke all on table public.group_account_overwrites from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;

-- service_role（Next.js API route：刪除使用者、寫紀錄）
grant select, insert, update, delete on table
  public.site_roles, public.site_user_roles, public.site_pending_roles,
  public.groups, public.group_roles, public.group_members, public.group_member_roles,
  public.group_invites, public.group_email_invites, public.group_account_overwrites,
  public.audit_logs
to service_role;

-- ============================================================
-- 種子資料
-- ============================================================

-- @everyone（CREATE_GROUPS）與「管理員」（ADMINISTRATOR）；固定 id，重複執行不會多建
insert into public.site_roles (id, name, color, position, permissions, is_default)
select '00000000-0000-0000-0000-000000000000', '@everyone', '', 0, 256, true
where not exists (select 1 from public.site_roles where is_default)
on conflict (id) do nothing;

insert into public.site_roles (id, name, color, position, permissions, is_default)
values ('00000000-0000-0000-0000-000000000001', '管理員', '#e11d48', 100, 1, false)
on conflict (id) do nothing;

-- marryhan25648@gmail.com：已有 profile 就直接指派「管理員」，還沒註冊就記在 site_pending_roles
insert into public.site_user_roles (user_id, role_id)
select p.id, r.id
from public.profiles p
left join auth.users u on u.id = p.id
join public.site_roles r on r.id = '00000000-0000-0000-0000-000000000001'
where lower(coalesce(u.email, p.email)) = 'marryhan25648@gmail.com'
on conflict do nothing;

insert into public.site_pending_roles (email, role_id)
select 'marryhan25648@gmail.com', r.id
from public.site_roles r
where r.id = '00000000-0000-0000-0000-000000000001'
  and not exists (
    select 1 from public.profiles p
    left join auth.users u on u.id = p.id
    where lower(coalesce(u.email, p.email)) = 'marryhan25648@gmail.com'
  )
on conflict do nothing;

-- ============================================================
-- 內部 helper（只給 security definer 函式用）
-- ============================================================

-- 目前登入者；未登入就 raise
create or replace function public.require_uid()
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

-- 使用者的 email（小寫；auth.users 優先，沒有時用 profiles.email）
create or replace function public.user_email(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(
    (select u.email from auth.users u where u.id = p_uid),
    (select p.email from profiles p where p.id = p_uid)
  ));
$$;

-- 全站權限中文名稱（錯誤訊息用）
create or replace function public.site_perm_name(p_bit bigint)
returns text
language sql
immutable
as $$
  select case p_bit
    when 1 then '管理員' when 2 then '進入後台' when 4 then '查看使用者' when 8 then '管理使用者'
    when 16 then '查看使用者的 2FA' when 32 then '管理使用者的 2FA' when 64 then '管理身分組'
    when 128 then '查看操作紀錄' when 256 then '建立群組' when 512 then '管理所有群組'
    else p_bit::text end;
$$;

-- 群組權限中文名稱（錯誤訊息用）
create or replace function public.group_perm_name(p_bit bigint)
returns text
language sql
immutable
as $$
  select case p_bit
    when 1 then '群組管理員' when 2 then '查看驗證碼' when 4 then '查看金鑰' when 8 then '管理驗證碼'
    when 16 then '邀請成員' when 32 then '移除成員' when 64 then '管理身分組'
    when 128 then '管理群組' when 256 then '查看操作紀錄'
    else p_bit::text end;
$$;

-- 寫一筆操作紀錄（gid null = 全站）
create or replace function public.audit(p_gid uuid, p_actor uuid, p_action text, p_target_type text, p_target_id text, p_detail jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into audit_logs (group_id, actor_id, action, target_type, target_id, detail)
  values (p_gid, p_actor, p_action, p_target_type, p_target_id, coalesce(p_detail, '{}'::jsonb));
$$;

-- SiteUserBrief：{ id, name, username, photo_url, email }；with_email false 時 email 是 null
create or replace function public.user_brief(p_uid uuid, p_with_email boolean)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'username', p.username, 'photo_url', p.photo_url,
    'email', case when p_with_email then coalesce(p.email, (select u.email from auth.users u where u.id = p.id)) end
  )
  from profiles p
  where p.id = p_uid;
$$;

-- 使用者顯示名稱（紀錄 detail.name 用）：名稱 → @ID → email
create or replace function public.display_name(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(p.name, ''), p.username, p.email)
  from profiles p where p.id = p_uid;
$$;

-- 檢查身分組顏色：'' 或 '#rrggbb'（存小寫）
create or replace function public.norm_color(v text)
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
create or replace function public.norm_role_name(v text)
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

-- ---------- 全站權限 ----------

-- 全站權限：@everyone OR 該使用者所有身分組；含 ADMINISTRATOR → SITE_ALL
create or replace function public.site_permissions(p_uid uuid)
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
    return 1023;
  end if;
  return perms & 1023;
end;
$$;

-- 使用者在全站的最高位置（沒有身分組時 0）
create or replace function public.site_top_position(p_uid uuid)
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

-- 沒有指定的全站權限就 raise；回傳展開後的權限
create or replace function public.site_require(p_uid uuid, p_bit bigint)
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

-- 全站階層：能不能管理這個 position 的身分組（全站 ADMINISTRATOR 不受限）
create or replace function public.site_can_manage_position(p_uid uuid, p_position int)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select site_permissions(p_uid) & 1 <> 0 or p_position < site_top_position(p_uid);
$$;

-- 全站階層：能不能管理這位使用者（全站 ADMINISTRATOR 不受限）
create or replace function public.site_can_manage_user(p_uid uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select site_permissions(p_uid) & 1 <> 0 or site_top_position(p_target) < site_top_position(p_uid);
$$;

-- 目前擁有全站 ADMINISTRATOR 的使用者數量
create or replace function public.site_admin_count()
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

-- 最後一位管理員保護：變更前有管理員、變更後沒有 → raise（整個 RPC 會回滾）
create or replace function public.site_assert_admin_left(p_before bigint)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_before > 0 and site_admin_count() = 0 then
    raise exception '至少要保留一位擁有「管理員」權限的使用者';
  end if;
end;
$$;

-- 全站身分組：依 position 由高到低重新編號為 n..1（@everyone 維持 0）
create or replace function public.site_roles_renumber()
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

-- ---------- 群組權限 ----------

-- 是否為群組成員
create or replace function public.group_is_member(p_gid uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from group_members where group_id = p_gid and user_id = p_uid);
$$;

-- 在群組裡視同擁有者：擁有者、全站 ADMINISTRATOR、全站 MANAGE_GROUPS（不受群組階層限制）
create or replace function public.group_is_super(p_gid uuid, p_uid uuid)
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
create or replace function public.group_permissions(p_gid uuid, p_uid uuid)
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
    return 511;
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
    return 511;
  end if;
  return perms & 511;
end;
$$;

-- 成員在群組的最高位置（沒有身分組時 0）
create or replace function public.group_top_position(p_gid uuid, p_uid uuid)
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

-- 單筆驗證碼權限（Discord 頻道算法）：
-- base 含 ADMINISTRATOR → GROUP_ALL；依序套用 @everyone、成員身分組（allow / deny 各自 OR）、成員本人的覆寫；
-- 最後沒有 VIEW_CODES → 0
create or replace function public.account_permissions(p_account uuid, p_uid uuid)
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
    return 511;
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

-- 群組存在、呼叫者是成員（或視同擁有者）且有指定權限，否則 raise；回傳基礎權限
create or replace function public.group_require(p_gid uuid, p_uid uuid, p_bit bigint)
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

-- 群組驗證碼所屬的群組；找不到（或是個人的）就 raise
create or replace function public.account_group(p_account uuid)
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
create or replace function public.account_require(p_account uuid, p_uid uuid, p_bit bigint)
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

-- 群組階層：能不能管理這個 position 的身分組（擁有者 / 全站管理不受限）
create or replace function public.group_can_manage_position(p_gid uuid, p_uid uuid, p_position int)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select group_is_super(p_gid, p_uid) or p_position < group_top_position(p_gid, p_uid);
$$;

-- 群組階層：能不能管理這位成員（擁有者 / 全站管理不受限；其他人管不到擁有者）
create or replace function public.group_can_manage_member(p_gid uuid, p_uid uuid, p_target uuid)
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
create or replace function public.group_roles_renumber(p_gid uuid)
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
create or replace function public.group_brief(p_gid uuid)
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

-- 邀請連結是否有效：null = 有效，否則 'revoked' / 'expired' / 'used_up'
create or replace function public.invite_invalid_reason(i group_invites)
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

-- 產生 10 碼英數邀請碼（不重複）
create or replace function public.new_invite_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  c text;
begin
  loop
    c := substr(md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text), 1, 10);
    exit when not exists (select 1 from group_invites where code = c);
  end loop;
  return c;
end;
$$;

-- 操作紀錄分頁：[{ id, actor, action, target_type, target_id, detail, created_at }]，id 由大到小
create or replace function public.audit_page(p_gid uuid, p_before bigint, p_size int, p_with_email boolean)
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
    ) order by l.id desc), '[]'::jsonb)
  from (
    select * from audit_logs
    where group_id is not distinct from p_gid
      and (p_before is null or id < p_before)
    order by id desc
    limit greatest(1, least(coalesce(p_size, 50), 200))
  ) l;
$$;

revoke execute on function public.require_uid() from public, anon, authenticated;
revoke execute on function public.user_email(uuid) from public, anon, authenticated;
revoke execute on function public.site_perm_name(bigint) from public, anon, authenticated;
revoke execute on function public.group_perm_name(bigint) from public, anon, authenticated;
revoke execute on function public.audit(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.user_brief(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.display_name(uuid) from public, anon, authenticated;
revoke execute on function public.norm_color(text) from public, anon, authenticated;
revoke execute on function public.norm_role_name(text) from public, anon, authenticated;
revoke execute on function public.site_permissions(uuid) from public, anon, authenticated;
revoke execute on function public.site_top_position(uuid) from public, anon, authenticated;
revoke execute on function public.site_require(uuid, bigint) from public, anon, authenticated;
revoke execute on function public.site_can_manage_position(uuid, int) from public, anon, authenticated;
revoke execute on function public.site_can_manage_user(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.site_admin_count() from public, anon, authenticated;
revoke execute on function public.site_assert_admin_left(bigint) from public, anon, authenticated;
revoke execute on function public.site_roles_renumber() from public, anon, authenticated;
revoke execute on function public.group_is_member(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.group_is_super(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.group_permissions(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.group_top_position(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.account_permissions(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.group_require(uuid, uuid, bigint) from public, anon, authenticated;
revoke execute on function public.account_group(uuid) from public, anon, authenticated;
revoke execute on function public.account_require(uuid, uuid, bigint) from public, anon, authenticated;
revoke execute on function public.group_can_manage_position(uuid, uuid, int) from public, anon, authenticated;
revoke execute on function public.group_can_manage_member(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.group_roles_renumber(uuid) from public, anon, authenticated;
revoke execute on function public.group_brief(uuid) from public, anon, authenticated;
revoke execute on function public.invite_invalid_reason(public.group_invites) from public, anon, authenticated;
revoke execute on function public.new_invite_code() from public, anon, authenticated;
revoke execute on function public.audit_page(uuid, bigint, int, boolean) from public, anon, authenticated;

-- ============================================================
-- 登入時套用 pending roles
-- ============================================================

-- 把 site_pending_roles 中 email 符合的身分組指派給使用者並刪除
create or replace function public.apply_pending_roles(p_uid uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e text := lower(trim(coalesce(p_email, '')));
begin
  if p_uid is null or e = '' or not exists (select 1 from profiles where id = p_uid) then
    return;
  end if;
  insert into site_user_roles (user_id, role_id)
  select p_uid, pr.role_id from site_pending_roles pr where pr.email = e
  on conflict do nothing;
  delete from site_pending_roles where email = e;
end;
$$;

revoke execute on function public.apply_pending_roles(uuid, text) from public, anon, authenticated;

-- 登入時自我修復：確保使用者有 profile、接回 Firestore 舊資料（原 0003 邏輯不變），
-- 最後（profile 已存在也會執行）套用 pending roles
create or replace function public.ensure_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  u auth.users%rowtype;
  legacy public.legacy_import%rowtype;
begin
  if uid is null then
    return;
  end if;

  select * into u from auth.users where id = uid;

  if not exists (select 1 from public.profiles where id = uid) then
    select * into legacy from public.legacy_import where email = u.email;

    insert into public.profiles (
      id, email, name, photo_url, bg_photo_url,
      email_verified, phone_number, creation_time, last_sign_in_time, totp, migrated
    )
    values (
      uid,
      u.email,
      coalesce(legacy.name, u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
      coalesce(legacy.photo_url, u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture'),
      coalesce(legacy.bg_photo_url, 'https://img.freepik.com/free-photo/abstract-luxury-plain-blur-grey-black-gradient-used-as-background-studio-wall-display-your-products_1258-63747.jpg?w=2000'),
      (u.email_confirmed_at is not null),
      coalesce(legacy.phone_number, ''),
      coalesce(u.created_at::text, ''),
      coalesce(u.last_sign_in_at::text, ''),
      coalesce(legacy.totp, '[]'::jsonb),
      (legacy.email is not null)
    )
    on conflict (id) do nothing;

    -- 舊資料一次性接回後刪除
    if legacy.email is not null then
      delete from public.legacy_import where email = u.email;
    end if;
  end if;

  perform public.apply_pending_roles(uid, coalesce(u.email, (select p.email from public.profiles p where p.id = uid)));
end;
$$;

revoke execute on function public.ensure_profile() from public, anon;
grant execute on function public.ensure_profile() to authenticated;

-- 新使用者註冊時自動建立 profile（原 0002 邏輯不變），最後套用 pending roles
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  legacy public.legacy_import%rowtype;
begin
  select * into legacy from public.legacy_import where email = new.email;

  insert into public.profiles (
    id, email, name, photo_url, bg_photo_url,
    email_verified, phone_number, creation_time, last_sign_in_time, totp,
    migrated
  )
  values (
    new.id,
    new.email,
    coalesce(legacy.name, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(legacy.photo_url, new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    coalesce(legacy.bg_photo_url, 'https://img.freepik.com/free-photo/abstract-luxury-plain-blur-grey-black-gradient-used-as-background-studio-wall-display-your-products_1258-63747.jpg?w=2000'),
    (new.email_confirmed_at is not null),
    coalesce(legacy.phone_number, ''),
    coalesce(new.created_at::text, ''),
    coalesce(new.last_sign_in_at::text, ''),
    coalesce(legacy.totp, '[]'::jsonb),
    (legacy.email is not null)
  )
  on conflict (id) do nothing;

  if legacy.email is not null then
    delete from public.legacy_import where email = new.email;
  end if;

  perform public.apply_pending_roles(new.id, new.email);

  return new;
end;
$$;

-- ============================================================
-- 3.1 自己的權限
-- ============================================================

-- 自己的全站權限（已展開）、最高位置、身分組（不含 @everyone，由高到低）；未登入回傳 null
create or replace function public.me_permissions()
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
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'color', r.color, 'position', r.position)
                       order by r.position desc, r.created_at)
      from site_user_roles ur join site_roles r on r.id = ur.role_id
      where ur.user_id = uid and not r.is_default
    ), '[]'::jsonb)
  );
end;
$$;

-- ============================================================
-- 3.2 群組
-- ============================================================

-- 建立群組（全站 CREATE_GROUPS）：同時建立 @everyone（VIEW_CODES）並把自己加成成員；回傳群組 id
create or replace function public.group_create(name text, description text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_name text := trim(coalesce(group_create.name, ''));
  p_desc text := trim(coalesce(group_create.description, ''));
  gid uuid;
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

  insert into groups (name, description, owner_id) values (p_name, p_desc, uid) returning id into gid;
  insert into group_roles (group_id, name, color, position, permissions, is_default)
  values (gid, '@everyone', '', 0, 2, true);
  insert into group_members (group_id, user_id) values (gid, uid);

  perform audit(gid, uid, 'group.create', 'group', gid::text, jsonb_build_object('name', p_name));
  return gid;
end;
$$;

-- 我所在的群組：[{ id, name, description, owner_id, is_owner, member_count, account_count, permissions }]
create or replace function public.my_groups()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', g.id, 'name', g.name, 'description', g.description, 'owner_id', g.owner_id,
      'is_owner', g.owner_id = uid,
      'member_count', (select count(*) from group_members x where x.group_id = g.id),
      'account_count', (select count(*) from totp_accounts a where a.group_id = g.id and account_permissions(a.id, uid) & 2 <> 0),
      'permissions', group_permissions(g.id, uid)
    ) order by m.joined_at, g.created_at)
    from group_members m join groups g on g.id = m.group_id
    where m.user_id = uid
  ), '[]'::jsonb);
end;
$$;

-- 群組內頁資料（成員或全站 MANAGE_GROUPS）：group / is_owner / permissions / top_position / roles / members / invites / email_invites
create or replace function public.group_detail(gid uuid)
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
  owner uuid;
begin
  select owner_id into owner from groups where id = p_gid;
  return jsonb_build_object(
    'group', (select jsonb_build_object('id', g.id, 'name', g.name, 'description', g.description,
                                        'owner_id', g.owner_id, 'created_at', g.created_at)
              from groups g where g.id = p_gid),
    'is_owner', owner = uid,
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
        user_brief(m.user_id, true) || jsonb_build_object(
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
        'code', i.code, 'created_by', user_brief(i.created_by, true), 'created_at', i.created_at,
        'expires_at', i.expires_at, 'max_uses', i.max_uses, 'uses', i.uses
      ) order by i.created_at desc)
      from group_invites i where i.group_id = p_gid and invite_invalid_reason(i) is null
    ), '[]'::jsonb) else '[]'::jsonb end,
    'email_invites', case when show_invites then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'email', e.email, 'invited_by', user_brief(e.invited_by, true), 'created_at', e.created_at
      ) order by e.created_at desc)
      from group_email_invites e where e.group_id = p_gid
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

-- 修改群組名稱與說明（MANAGE_GROUP）；null 代表不改
create or replace function public.group_update(gid uuid, name text, description text)
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

-- 刪除群組（擁有者、全站 ADMINISTRATOR）；群組紀錄會跟著刪除，所以記在全站紀錄
create or replace function public.group_delete(gid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_delete.gid;
  g groups%rowtype;
begin
  select * into g from groups where id = p_gid;
  if g.id is null then
    raise exception '找不到這個群組';
  end if;
  if g.owner_id <> uid and site_permissions(uid) & 1 = 0 then
    raise exception '只有群組擁有者可以刪除群組';
  end if;
  delete from groups where id = p_gid;
  perform audit(null, uid, 'group.delete', 'group', p_gid::text, jsonb_build_object('name', g.name, 'owner_id', g.owner_id));
end;
$$;

-- 轉移擁有權（只有擁有者）；新擁有者必須是成員
create or replace function public.group_transfer(gid uuid, new_owner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_transfer.gid;
  p_new uuid := group_transfer.new_owner;
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
  update groups set owner_id = p_new where id = p_gid;
  perform audit(p_gid, uid, 'group.transfer', 'member', p_new::text,
                jsonb_build_object('name', display_name(p_new), 'group_name', (select name from groups where id = p_gid),
                                   'from', uid, 'to', p_new));
end;
$$;

-- 離開群組（擁有者不能離開，要先轉移或刪除）
create or replace function public.group_leave(gid uuid)
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
  delete from group_members where group_id = p_gid and user_id = uid;
  perform audit(p_gid, uid, 'group.member.leave', 'member', uid::text, jsonb_build_object('name', display_name(uid)));
end;
$$;

-- 移除成員（KICK_MEMBERS + 階層；任何人都不能踢擁有者）
create or replace function public.group_kick(gid uuid, user_id uuid)
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
  delete from group_members m where m.group_id = p_gid and m.user_id = p_target;
  perform audit(p_gid, uid, 'group.member.kick', 'member', p_target::text, jsonb_build_object('name', display_name(p_target)));
end;
$$;

-- 指派成員身分組（MANAGE_ROLES + 階層）：只改呼叫者管得到的身分組，管不到的維持原樣；加入管不到的就 raise
create or replace function public.group_set_member_roles(gid uuid, user_id uuid, role_ids uuid[])
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
  top int;
  is_super boolean;
  added uuid[];
  removed uuid[];
begin
  perform group_require(p_gid, uid, 64);
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

  -- 要新加入的身分組都必須管得到
  select array_agg(r.id) into added
  from group_roles r
  where r.id = any (p_roles)
    and not exists (select 1 from group_member_roles mr where mr.group_id = p_gid and mr.user_id = p_target and mr.role_id = r.id);
  if exists (select 1 from group_roles r where r.id = any (coalesce(added, '{}')) and not is_super and r.position >= top) then
    raise exception '只能管理比你目前最高身分組還低的身分組 / 成員';
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
  end if;
end;
$$;

-- 建立群組身分組（MANAGE_ROLES；只能開自己有的位元）：position = 1，其他 ≥ 1 的全部 +1；回傳 id
create or replace function public.group_role_create(gid uuid, name text, color text, permissions bigint)
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
  p_perms bigint := coalesce(group_role_create.permissions, 0) & 511;
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
create or replace function public.group_role_update(role_id uuid, name text, color text, permissions bigint)
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

  p_perms := coalesce(group_role_update.permissions, r.permissions) & 511;
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
create or replace function public.group_role_delete(role_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  r group_roles%rowtype;
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
  delete from group_account_overwrites o where o.target_type = 'role' and o.target_id = r.id;
  delete from group_roles x where x.id = r.id;
  perform group_roles_renumber(r.group_id);
  perform audit(r.group_id, uid, 'group.role.delete', 'role', r.id::text, jsonb_build_object('name', r.name));
end;
$$;

-- 群組身分組排序（MANAGE_ROLES）：role_ids = 由高到低的完整順序（不含 @everyone）；
-- 管不到的身分組排名不能變；依新順序重新編號為 n..1
create or replace function public.group_roles_reorder(gid uuid, role_ids uuid[])
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

-- 群組驗證碼清單（成員）：只回傳有 VIEW_CODES 的，依 position 排序；不含金鑰
create or replace function public.group_accounts(gid uuid)
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

-- 新增群組驗證碼（群組層級 MANAGE_CODES）：items 同個人 TotpInput；回傳新增的 id
create or replace function public.group_account_add(gid uuid, items jsonb)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_account_add.gid;
  ids uuid[];
begin
  perform group_require(p_gid, uid, 8);
  ids := totp_import_items(null, p_gid, group_account_add.items, uid);
  insert into audit_logs (group_id, actor_id, action, target_type, target_id, detail)
  select p_gid, uid, 'group.account.create', 'account', a.id::text, jsonb_build_object('name', a.name)
  from totp_accounts a where a.id = any (ids);
  return ids;
end;
$$;

-- 編輯群組驗證碼（該筆的 MANAGE_CODES）；改 secret 不需要 VIEW_SECRETS
create or replace function public.group_account_update(account_id uuid, patch jsonb)
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
  perform totp_apply_patch(p_account, p_patch);
  select coalesce(jsonb_agg(k), '[]'::jsonb) into fields
  from jsonb_object_keys(case when jsonb_typeof(p_patch) = 'object' then p_patch else '{}'::jsonb end) k
  where k in ('name', 'category', 'secret', 'digits', 'period', 'algorithm', 'pinned');
  perform audit(account_group(p_account), uid, 'group.account.update', 'account', p_account::text,
                jsonb_build_object('name', (select name from totp_accounts where id = p_account), 'fields', fields));
end;
$$;

-- 刪除群組驗證碼（該筆的 MANAGE_CODES）
create or replace function public.group_account_delete(account_id uuid)
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
  delete from totp_accounts where id = p_account;
  perform audit(a.group_id, uid, 'group.account.delete', 'account', p_account::text, jsonb_build_object('name', a.name));
end;
$$;

-- 群組驗證碼排序（群組層級 MANAGE_CODES）：ids 裡沒有的照原順序接在後面
create or replace function public.group_accounts_reorder(gid uuid, ids uuid[])
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
  perform totp_reorder_items(null, p_gid, group_accounts_reorder.ids::text[]);
end;
$$;

-- 取得單筆金鑰（該筆的 VIEW_SECRETS）；記錄 group.account.secret.view
create or replace function public.group_account_secret(account_id uuid)
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
                jsonb_build_object('name', (select name from totp_accounts where id = p_account)));
  return s;
end;
$$;

-- 取得群組內所有「呼叫者有 VIEW_SECRETS」的金鑰：{ "<account_id>": "<secret>" }；記錄一筆 secret.view（帶數量）
create or replace function public.group_account_secrets(gid uuid)
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
                  jsonb_build_object('name', (select name from groups where id = p_gid), 'count', n));
  end if;
  return result;
end;
$$;

-- 單筆驗證碼的覆寫清單（MANAGE_ROLES）：[{ target_type, target_id, allow, deny }]
create or replace function public.group_account_overwrites(account_id uuid)
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
-- 新開的「允許」只能是呼叫者在這筆本身就有的權限
create or replace function public.group_set_overwrite(account_id uuid, target_type text, target_id uuid, allow bigint, deny bigint)
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

  select o.allow into old_allow from group_account_overwrites o
  where o.account_id = p_account and o.target_type = p_type and o.target_id = p_target;
  if p_allow & ~coalesce(old_allow, 0) & ~account_permissions(p_account, uid) <> 0 then
    raise exception '只能允許你自己在這筆驗證碼擁有的權限';
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

-- 呼叫者有 VIEW_CODES 的驗證碼 id（給 /api/groups/codes 用）
create or replace function public.group_codes_permitted(gid uuid)
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
  return coalesce((
    select array_agg(a.id order by a.position, a.created_at, a.id)
    from totp_accounts a
    where a.group_id = p_gid and account_permissions(a.id, uid) & 2 <> 0
  ), '{}');
end;
$$;

-- 群組操作紀錄（VIEW_AUDIT_LOG）：id 由大到小，before_id null 從最新開始
create or replace function public.group_audit_log(gid uuid, before_id bigint, page_size int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_audit_log.gid;
begin
  perform group_require(p_gid, uid, 256);
  return audit_page(p_gid, group_audit_log.before_id, group_audit_log.page_size, true);
end;
$$;

-- ============================================================
-- 3.3 邀請
-- ============================================================

-- 建立邀請連結（CREATE_INVITE）：null = 不過期 / 不限次數；回傳 10 碼邀請碼
create or replace function public.group_invite_create(gid uuid, expires_in_hours int, max_uses int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_gid uuid := group_invite_create.gid;
  p_hours int := group_invite_create.expires_in_hours;
  p_max int := group_invite_create.max_uses;
  c text;
begin
  perform group_require(p_gid, uid, 16);
  if p_hours is not null and p_hours <= 0 then
    raise exception '有效時間必須大於 0';
  end if;
  if p_max is not null and p_max <= 0 then
    raise exception '使用次數必須大於 0';
  end if;
  c := new_invite_code();
  insert into group_invites (code, group_id, created_by, expires_at, max_uses)
  values (c, p_gid, uid,
          case when p_hours is null then null else now() + make_interval(hours => p_hours) end,
          p_max);
  perform audit(p_gid, uid, 'group.invite.create', 'invite', c,
                jsonb_build_object('name', c, 'expires_in_hours', p_hours, 'max_uses', p_max));
  return c;
end;
$$;

-- 撤銷邀請連結（建立者，或 MANAGE_GROUP）
create or replace function public.group_invite_revoke(code text)
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

-- 邀請連結資訊（登入）：{ valid, reason, group, inviter, already_member }
create or replace function public.group_invite_info(code text)
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
    return jsonb_build_object('valid', false, 'reason', 'not_found', 'group', null, 'inviter', null, 'already_member', false);
  end if;
  reason := invite_invalid_reason(i);
  return jsonb_build_object(
    'valid', reason is null,
    'reason', reason,
    'group', group_brief(i.group_id),
    'inviter', user_brief(i.created_by, site_permissions(uid) & 4 <> 0 or group_is_member(i.group_id, uid)),
    'already_member', group_is_member(i.group_id, uid)
  );
end;
$$;

-- 用邀請連結加入群組（登入）：已是成員直接回傳 id 不扣次數；成功時 uses + 1
create or replace function public.group_join(code text)
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
  select * into i from group_invites x where x.code = trim(group_join.code) for update;
  if i.code is null then
    raise exception '找不到這個邀請連結';
  end if;
  if group_is_member(i.group_id, uid) then
    return i.group_id;
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
  return i.group_id;
end;
$$;

-- 用 Email 或 @ID 邀請（CREATE_INVITE）：@ID 找不到 → raise；email 可以是還沒註冊的人；已邀請過不重複新增
create or replace function public.group_invite_user(gid uuid, target text)
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

  insert into group_email_invites (group_id, email, invited_by)
  values (p_gid, e, uid)
  on conflict (group_id, email) do nothing
  returning id into new_id;
  if new_id is not null then
    perform audit(p_gid, uid, 'group.invite.email', 'invite', new_id::text,
                  jsonb_build_object('name', case when via = 'username' then '@' || username_normalize(t) else e end,
                                     'email', e, 'via', via));
  end if;
end;
$$;

-- 取消 Email / @ID 邀請（邀請者，或 CREATE_INVITE）
create or replace function public.group_email_invite_cancel(invite_id uuid)
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

-- 我收到的 Email / @ID 邀請（比對 auth.users.email，小寫）
create or replace function public.my_invitations()
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

-- 回覆邀請（被邀請者本人）：接受回傳群組 id，拒絕回傳 null；兩者都刪除邀請
create or replace function public.respond_invitation(invite_id uuid, accept boolean)
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
  delete from group_email_invites x where x.id = i.id;
  if not coalesce(respond_invitation.accept, false) then
    return null;
  end if;
  if not group_is_member(i.group_id, uid) then
    insert into group_members (group_id, user_id) values (i.group_id, uid) on conflict do nothing;
    perform audit(i.group_id, uid, 'group.member.join', 'member', uid::text,
                  jsonb_build_object('name', display_name(uid), 'via', 'email', 'invited_by', i.invited_by));
  end if;
  return i.group_id;
end;
$$;

-- ============================================================
-- 3.4 後台
-- ============================================================

-- AdminUser：{ id, email, name, username, photo_url, creation_time, last_login_*, role_ids, top_position, totp_count, vault_enabled }
create or replace function public.admin_user_json(p_uid uuid)
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
    'last_login_ip', p.last_login_ip,
    'last_login_device', p.last_login_device,
    'role_ids', coalesce((
      select jsonb_agg(ur.role_id order by r.position desc)
      from site_user_roles ur join site_roles r on r.id = ur.role_id
      where ur.user_id = p.id and not r.is_default
    ), '[]'::jsonb),
    'top_position', site_top_position(p.id),
    'totp_count', (select count(*) from totp_accounts a where a.owner_id = p.id),
    'vault_enabled', p.vault is not null
  )
  from profiles p
  left join auth.users u on u.id = p.id
  where p.id = p_uid;
$$;

revoke execute on function public.admin_user_json(uuid) from public, anon, authenticated;

-- 使用者列表（VIEW_USERS）：search 比對 email / name / username；依建立時間新到舊
create or replace function public.admin_users(search text, page_offset int, page_size int)
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

  return jsonb_build_object('total', total, 'users', users);
end;
$$;

-- 使用者詳情（VIEW_USERS）：AdminUser 加 groups: [{ id, name, is_owner }]
create or replace function public.admin_user(user_id uuid)
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

-- 修改使用者名稱與 @ID（MANAGE_USERS + 階層）：null 代表不改，空字串代表清除 @ID
create or replace function public.admin_update_user(user_id uuid, name text, username text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_target uuid := admin_update_user.user_id;
  p_name text := admin_update_user.name;
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

  if p_username is not null then
    v := username_normalize(p_username);
    if v is not null then
      perform username_assert(v, p_target);
    end if;
  end if;

  begin
    update profiles p
    set name = case when p_name is null then p.name else trim(p_name) end,
        username = case when p_username is null then p.username else v end,
        updated_at = now()
    where p.id = p_target;
  exception when unique_violation then
    raise exception '這個 @ID 已被使用';
  end;

  perform audit(null, uid, 'site.user.update', 'user', p_target::text, jsonb_build_object(
    'name', coalesce(nullif(case when p_name is null then old.name else trim(p_name) end, ''), display_name(p_target)),
    'old_name', old.name,
    'username', case when p_username is null then old.username else v end, 'old_username', old.username));
end;
$$;

-- 使用者的 2FA（VIEW_USER_TOTP）：已加密（enc:v1:）的 secret 是 null、encrypted true；記錄 site.user.totp.view
create or replace function public.admin_user_totp(user_id uuid)
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
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'name', a.name, 'category', a.category, 'digits', a.digits, 'period', a.period,
    'algorithm', a.algorithm, 'pinned', a.pinned,
    'secret', case when coalesce(s.secret, '') like 'enc:v1:%' then null else coalesce(s.secret, '') end,
    'encrypted', coalesce(s.secret, '') like 'enc:v1:%'
  ) order by a.position, a.created_at, a.id), '[]'::jsonb)
  into result
  from totp_accounts a
  left join totp_secrets s on s.account_id = a.id
  where a.owner_id = p_target;
  perform audit(null, uid, 'site.user.totp.view', 'user', p_target::text,
                jsonb_build_object('name', display_name(p_target), 'count', jsonb_array_length(result)));
  return result;
end;
$$;

-- 修改使用者的一筆 2FA（MANAGE_USER_TOTP）：patch 同 totp_update；該使用者啟用加密時不能改 secret
create or replace function public.admin_update_user_totp(user_id uuid, item_id uuid, patch jsonb)
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
  fields jsonb;
begin
  perform site_require(uid, 32);
  if not exists (select 1 from totp_accounts a where a.id = p_item and a.owner_id = p_target) then
    raise exception '找不到這筆驗證碼';
  end if;
  if jsonb_typeof(p_patch) = 'object' and p_patch ? 'secret'
     and exists (select 1 from profiles p where p.id = p_target and p.vault is not null) then
    raise exception '這位使用者已啟用金鑰加密，無法修改金鑰';
  end if;
  perform totp_apply_patch(p_item, p_patch);
  select coalesce(jsonb_agg(k), '[]'::jsonb) into fields
  from jsonb_object_keys(case when jsonb_typeof(p_patch) = 'object' then p_patch else '{}'::jsonb end) k
  where k in ('name', 'category', 'secret', 'digits', 'period', 'algorithm', 'pinned');
  perform audit(null, uid, 'site.user.totp.update', 'user', p_target::text, jsonb_build_object(
    'name', display_name(p_target), 'item_id', p_item,
    'item_name', (select name from totp_accounts where id = p_item), 'fields', fields));
end;
$$;

-- 刪除使用者的一筆 2FA（MANAGE_USER_TOTP）
create or replace function public.admin_delete_user_totp(user_id uuid, item_id uuid)
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
  select * into a from totp_accounts x where x.id = p_item and x.owner_id = p_target;
  if a.id is null then
    raise exception '找不到這筆驗證碼';
  end if;
  delete from totp_accounts x where x.id = p_item;
  perform audit(null, uid, 'site.user.totp.delete', 'user', p_target::text,
                jsonb_build_object('name', display_name(p_target), 'item_id', p_item, 'item_name', a.name));
end;
$$;

-- 能不能刪除這位使用者（給 /api/admin/delete-user 用）：
-- MANAGE_USERS + 階層 + 不是自己 + 不是最後一位管理員 + 沒有擁有任何群組；不通過時 raise 說明原因
create or replace function public.admin_can_delete_user(user_id uuid)
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
  if exists (select 1 from groups where owner_id = p_target) then
    raise exception '這位使用者還擁有群組，請先轉移擁有權或刪除群組';
  end if;
  return true;
end;
$$;

-- 使用者自己刪除帳戶前檢查：還擁有群組、或是全站最後一位管理員 → raise；否則回傳 true
create or replace function public.can_delete_self()
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
  select count(*) into n from groups where owner_id = uid;
  if n > 0 then
    raise exception '你還是 % 個群組的擁有者，請先轉移擁有權或刪除群組', n;
  end if;
  if site_permissions(uid) & 1 <> 0 and site_admin_count() <= 1 then
    raise exception '你是最後一位管理員，請先把管理員身分組指派給其他人';
  end if;
  return true;
end;
$$;

-- 全站身分組列表（VIEW_ADMIN）：由高到低
create or replace function public.site_roles_list()
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
create or replace function public.site_role_create(name text, color text, permissions bigint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_name text := norm_role_name(site_role_create.name);
  p_color text := norm_color(site_role_create.color);
  p_perms bigint := coalesce(site_role_create.permissions, 0) & 1023;
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

-- 編輯全站身分組（MANAGE_ROLES + 階層 + 只能開自己有的位元）；@everyone 只能改 permissions；最後一位管理員保護
create or replace function public.site_role_update(role_id uuid, name text, color text, permissions bigint)
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
  if not r.is_default and not site_can_manage_position(uid, r.position) then
    raise exception '只能管理比你目前最高身分組還低的身分組 / 成員';
  end if;

  p_perms := coalesce(site_role_update.permissions, r.permissions) & 1023;
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
create or replace function public.site_role_delete(role_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  r site_roles%rowtype;
  admins bigint := site_admin_count();
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
  delete from site_roles x where x.id = r.id;
  perform site_assert_admin_left(admins);
  perform site_roles_renumber();
  perform audit(null, uid, 'site.role.delete', 'role', r.id::text, jsonb_build_object('name', r.name));
end;
$$;

-- 全站身分組排序（MANAGE_ROLES）：規則同 group_roles_reorder
create or replace function public.site_roles_reorder(role_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_ids uuid[] := coalesce(site_roles_reorder.role_ids, '{}');
  n int;
  is_admin boolean;
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

  is_admin := site_permissions(uid) & 1 <> 0;
  top := site_top_position(uid);

  if not is_admin and exists (
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

-- 指派使用者全站身分組（MANAGE_ROLES + 階層）：規則同 group_set_member_roles；最後一位管理員保護
create or replace function public.site_set_user_roles(user_id uuid, role_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
  p_target uuid := site_set_user_roles.user_id;
  p_roles uuid[] := coalesce(site_set_user_roles.role_ids, '{}');
  is_admin boolean;
  top int;
  added uuid[];
  removed uuid[];
  admins bigint := site_admin_count();
begin
  perform site_require(uid, 64);
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

  is_admin := site_permissions(uid) & 1 <> 0;
  top := site_top_position(uid);

  select array_agg(r.id) into added
  from site_roles r
  where r.id = any (p_roles)
    and not exists (select 1 from site_user_roles ur where ur.user_id = p_target and ur.role_id = r.id);
  if exists (select 1 from site_roles r where r.id = any (coalesce(added, '{}')) and not is_admin and r.position >= top) then
    raise exception '只能管理比你目前最高身分組還低的身分組 / 成員';
  end if;

  select array_agg(ur.role_id) into removed
  from site_user_roles ur join site_roles r on r.id = ur.role_id
  where ur.user_id = p_target
    and not (ur.role_id = any (p_roles))
    and (is_admin or r.position < top);

  delete from site_user_roles ur where ur.user_id = p_target and ur.role_id = any (coalesce(removed, '{}'));
  insert into site_user_roles (user_id, role_id)
  select p_target, x from unnest(coalesce(added, '{}')) as x
  on conflict do nothing;

  perform site_assert_admin_left(admins);

  if coalesce(array_length(added, 1), 0) + coalesce(array_length(removed, 1), 0) > 0 then
    perform audit(null, uid, 'site.user.roles', 'user', p_target::text,
                  jsonb_build_object('name', display_name(p_target), 'added', coalesce(added, '{}'), 'removed', coalesce(removed, '{}')));
  end if;
end;
$$;

-- 所有群組（MANAGE_GROUPS）：[{ id, name, description, owner, member_count, account_count, created_at }]
create or replace function public.admin_groups(search text)
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

-- 全站操作紀錄（VIEW_AUDIT_LOG）：只列 group_id null 的紀錄
create or replace function public.admin_audit_log(before_id bigint, page_size int)
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
  return audit_page(null, admin_audit_log.before_id, admin_audit_log.page_size, site_permissions(uid) & 4 <> 0);
end;
$$;

-- ============================================================
-- RPC 權限：只開給登入使用者
-- ============================================================
revoke execute on function public.me_permissions() from public, anon;
revoke execute on function public.group_create(text, text) from public, anon;
revoke execute on function public.my_groups() from public, anon;
revoke execute on function public.group_detail(uuid) from public, anon;
revoke execute on function public.group_update(uuid, text, text) from public, anon;
revoke execute on function public.group_delete(uuid) from public, anon;
revoke execute on function public.group_transfer(uuid, uuid) from public, anon;
revoke execute on function public.group_leave(uuid) from public, anon;
revoke execute on function public.group_kick(uuid, uuid) from public, anon;
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
revoke execute on function public.group_account_secret(uuid) from public, anon;
revoke execute on function public.group_account_secrets(uuid) from public, anon;
revoke execute on function public.group_account_overwrites(uuid) from public, anon;
revoke execute on function public.group_set_overwrite(uuid, text, uuid, bigint, bigint) from public, anon;
revoke execute on function public.group_codes_permitted(uuid) from public, anon;
revoke execute on function public.group_audit_log(uuid, bigint, int) from public, anon;
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
revoke execute on function public.site_roles_list() from public, anon;
revoke execute on function public.site_role_create(text, text, bigint) from public, anon;
revoke execute on function public.site_role_update(uuid, text, text, bigint) from public, anon;
revoke execute on function public.site_role_delete(uuid) from public, anon;
revoke execute on function public.site_roles_reorder(uuid[]) from public, anon;
revoke execute on function public.site_set_user_roles(uuid, uuid[]) from public, anon;
revoke execute on function public.admin_groups(text) from public, anon;
revoke execute on function public.admin_audit_log(bigint, int) from public, anon;

grant execute on function public.me_permissions() to authenticated;
grant execute on function public.group_create(text, text) to authenticated;
grant execute on function public.my_groups() to authenticated;
grant execute on function public.group_detail(uuid) to authenticated;
grant execute on function public.group_update(uuid, text, text) to authenticated;
grant execute on function public.group_delete(uuid) to authenticated;
grant execute on function public.group_transfer(uuid, uuid) to authenticated;
grant execute on function public.group_leave(uuid) to authenticated;
grant execute on function public.group_kick(uuid, uuid) to authenticated;
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
grant execute on function public.group_account_secret(uuid) to authenticated;
grant execute on function public.group_account_secrets(uuid) to authenticated;
grant execute on function public.group_account_overwrites(uuid) to authenticated;
grant execute on function public.group_set_overwrite(uuid, text, uuid, bigint, bigint) to authenticated;
grant execute on function public.group_codes_permitted(uuid) to authenticated;
grant execute on function public.group_audit_log(uuid, bigint, int) to authenticated;
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
grant execute on function public.site_roles_list() to authenticated;
grant execute on function public.site_role_create(text, text, bigint) to authenticated;
grant execute on function public.site_role_update(uuid, text, text, bigint) to authenticated;
grant execute on function public.site_role_delete(uuid) to authenticated;
grant execute on function public.site_roles_reorder(uuid[]) to authenticated;
grant execute on function public.site_set_user_roles(uuid, uuid[]) to authenticated;
grant execute on function public.admin_groups(text) to authenticated;
grant execute on function public.admin_audit_log(bigint, int) to authenticated;
