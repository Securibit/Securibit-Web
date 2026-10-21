-- ============================================================
-- 安全性修正（0008 / 0009 之後執行；規格補充見 docs/groups-and-permissions.md 第 6 節）
-- 1. 後台查看 / 修改 / 刪除使用者的 2FA 也要遵守全站階層
-- 2. email 驗證過才套用 site_pending_roles、接回 legacy_import、比對 Email 邀請
-- 3. 驗證碼覆寫：允許與拒絕「有變動的位元」都必須是自己在這筆驗證碼擁有的權限
-- 4. 指派身分組：新加入的身分組權限不能超過自己的權限
-- 5. profiles 只開放部分欄位給使用者直接修改；email 一律以 auth.users 為準
-- 6. 加密設定：比對 expected_check 防止兩台裝置同時改密碼；已加密時不能存入明文金鑰
-- 7. 最後一位管理員檢查加 advisory lock，避免兩個交易同時拿掉管理員
-- 8. 全站只有「最高位身分組的持有者」不受階層限制（一般 ADMINISTRATOR 也要遵守階層）
-- 9. 邀請碼改用安全亂數、預設 7 天、最長 30 天；成員離開或被踢時撤銷他建立的邀請
-- 10. 群組成員的 email 只給有「移除成員」或「管理身分組」的人看
-- 可重複執行。
-- ============================================================

-- pgcrypto（Supabase 預設已裝在 extensions schema）；裝不起來時 new_invite_code 會改用 gen_random_uuid
do $$
begin
  create schema if not exists extensions;
  create extension if not exists pgcrypto with schema extensions;
exception when others then
  raise notice '無法啟用 pgcrypto（%），邀請碼改用 gen_random_uuid 產生', sqlerrm;
end;
$$;

-- ============================================================
-- 5. profiles 欄位權限
-- ============================================================

-- 使用者只能直接改自己的顯示資料；email、email_verified、vault、username、last_login_*、migrated、totp
-- 一律走 RPC（security definer）或 service role。新增 / 刪除 profile 也只由觸發器、ensure_profile 與後端處理。
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (name, photo_url, bg_photo_url, phone_number, creation_time, last_sign_in_time, migration_notified, updated_at)
  on table public.profiles to authenticated;
grant select, insert, update, delete on table public.profiles to service_role;
drop policy if exists "profiles_insert_own" on public.profiles;

-- 使用者的 email（小寫）：只回傳已驗證的 auth.users.email；沒有 auth.users 那列時才用 profiles.email
create or replace function public.user_email(p_uid uuid)
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

-- SiteUserBrief：{ id, name, username, photo_url, email }；with_email false 時 email 是 null（email 以 auth.users 為準）
create or replace function public.user_brief(p_uid uuid, p_with_email boolean)
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

-- 使用者顯示名稱（紀錄 detail.name 用）：名稱 → @ID → email（auth.users 優先）
create or replace function public.display_name(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(p.name, ''), p.username, (select u.email from auth.users u where u.id = p.id), p.email)
  from profiles p where p.id = p_uid;
$$;

-- ============================================================
-- 8. 全站階層：只有最高位身分組的持有者不受限
-- ============================================================

-- 是否為「最高位身分組的持有者」：自己有身分組，而且沒有人的最高身分組比自己高
-- （只看有人持有的身分組，避免最上面的身分組沒人時整個後台沒人管得到）
create or replace function public.site_is_root(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select site_top_position(p_uid) > 0
     and site_top_position(p_uid) >= (
       select coalesce(max(r.position), 0)
       from site_user_roles ur join site_roles r on r.id = ur.role_id
       where not r.is_default
     );
$$;

-- 全站階層：能不能管理這個 position 的身分組（最高位身分組的持有者不受限）
create or replace function public.site_can_manage_position(p_uid uuid, p_position int)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select site_is_root(p_uid) or p_position < site_top_position(p_uid);
$$;

-- 全站階層：能不能管理這位使用者（最高位身分組的持有者不受限）
create or replace function public.site_can_manage_user(p_uid uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select site_is_root(p_uid) or site_top_position(p_target) < site_top_position(p_uid);
$$;

-- ============================================================
-- 7. 最後一位管理員保護：先拿 advisory lock 再數，兩個交易同時拿掉管理員時，後面那個會看到前面的結果
-- （改成 volatile，lock 之後的查詢才會拿到新的 snapshot）
-- ============================================================
create or replace function public.site_assert_admin_left(p_before bigint)
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

-- ============================================================
-- 9. 邀請碼：12 bytes 安全亂數 → 16 碼 URL 安全 base64（96 bit）
-- ============================================================
create or replace function public.new_invite_code()
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

-- ============================================================
-- 10. 群組裡能不能看到其他成員的 email：擁有者 / 全站管理、或有 KICK_MEMBERS / MANAGE_ROLES
-- ============================================================
create or replace function public.group_sees_emails(p_gid uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select group_is_super(p_gid, p_uid) or group_permissions(p_gid, p_uid) & (32 | 64) <> 0;
$$;

-- ============================================================
-- 2. email 驗證過才接回舊資料、套用 pending roles
-- ============================================================

-- email 已驗證時：接回 legacy_import（搬進已存在的 profile）並套用 site_pending_roles；未驗證時什麼都不做，
-- 資料留在暫存表，等之後登入（ensure_profile）發現已驗證再套
create or replace function public.claim_verified_email(p_uid uuid, p_email text, p_confirmed_at timestamptz)
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

revoke execute on function public.claim_verified_email(uuid, text, timestamptz) from public, anon, authenticated;

-- 登入時自我修復：確保使用者有 profile、同步 email 與驗證狀態，email 驗證過才接回舊資料與套用 pending roles
create or replace function public.ensure_profile()
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
    'https://img.freepik.com/free-photo/abstract-luxury-plain-blur-grey-black-gradient-used-as-background-studio-wall-display-your-products_1258-63747.jpg?w=2000',
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

  perform public.claim_verified_email(uid, u.email, u.email_confirmed_at);
end;
$$;

-- 新使用者註冊時自動建立 profile；email 已驗證（例如 Google 登入）才接回舊資料與套用 pending roles
create or replace function public.handle_new_user()
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
    'https://img.freepik.com/free-photo/abstract-luxury-plain-blur-grey-black-gradient-used-as-background-studio-wall-display-your-products_1258-63747.jpg?w=2000',
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

-- ============================================================
-- 10. 群組內頁：成員 / 邀請建立者的 email 只給管得到成員的人
-- ============================================================
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
  with_email boolean := group_sees_emails(p_gid, uid);
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
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

-- ============================================================
-- 9. 離開 / 被踢時撤銷他建立的邀請連結、刪除他送出的 Email 邀請
-- ============================================================

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
  update group_invites i set revoked_at = coalesce(i.revoked_at, now()) where i.group_id = p_gid and i.created_by = uid;
  delete from group_email_invites e where e.group_id = p_gid and e.invited_by = uid;
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
  update group_invites i set revoked_at = coalesce(i.revoked_at, now()) where i.group_id = p_gid and i.created_by = p_target;
  delete from group_email_invites e where e.group_id = p_gid and e.invited_by = p_target;
  delete from group_members m where m.group_id = p_gid and m.user_id = p_target;
  perform audit(p_gid, uid, 'group.member.kick', 'member', p_target::text, jsonb_build_object('name', display_name(p_target)));
end;
$$;

-- ============================================================
-- 4. 指派群組成員身分組（MANAGE_ROLES + 階層）：新加入的身分組權限不能超過自己（擁有者 / 全站管理例外）
-- ============================================================
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
  if exists (select 1 from group_roles r where r.id = any (coalesce(added, '{}')) and not is_super and r.permissions & 511 & ~mine <> 0) then
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
  end if;
end;
$$;

-- ============================================================
-- 3. 驗證碼覆寫（MANAGE_ROLES + 階層）：允許與拒絕中有變動的位元（新舊 XOR）
--    都必須是呼叫者在這筆驗證碼本身就有的權限（擁有者 / 全站管理例外）
-- ============================================================
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

-- ============================================================
-- 9. 建立邀請連結（CREATE_INVITE）：沒給有效時間預設 7 天，最長 30 天
-- ============================================================
create or replace function public.group_invite_create(gid uuid, expires_in_hours int, max_uses int)
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

-- 既有「永不過期」的邀請連結（舊的 10 碼邀請碼）改成從現在起 30 天後到期
update public.group_invites set expires_at = now() + interval '30 days'
where expires_at is null and revoked_at is null;

-- 邀請連結資訊（登入）：{ valid, reason, group, inviter, already_member }
-- 邀請者 email 只給有全站 VIEW_USERS、或在該群組看得到成員 email 的人
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
    'inviter', user_brief(i.created_by, site_permissions(uid) & 4 <> 0 or group_sees_emails(i.group_id, uid)),
    'already_member', group_is_member(i.group_id, uid)
  );
end;
$$;

-- ============================================================
-- 1. 後台的使用者 2FA：目標是自己，或在全站階層管得到對方
-- ============================================================

-- 使用者的 2FA（VIEW_USER_TOTP + 階層）：已加密（enc:v1:）的 secret 是 null、encrypted true；記錄 site.user.totp.view
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
  where a.owner_id = p_target;
  perform audit(null, uid, 'site.user.totp.view', 'user', p_target::text,
                jsonb_build_object('name', display_name(p_target), 'count', jsonb_array_length(result)));
  return result;
end;
$$;

-- 修改使用者的一筆 2FA（MANAGE_USER_TOTP + 階層）：patch 同 totp_update；該使用者啟用加密時不能改 secret
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
  if p_target <> uid and not site_can_manage_user(uid, p_target) then
    raise exception '只能管理比你目前最高身分組還低的身分組 / 成員';
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

-- 刪除使用者的一筆 2FA（MANAGE_USER_TOTP + 階層）
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
  if p_target <> uid and not site_can_manage_user(uid, p_target) then
    raise exception '只能管理比你目前最高身分組還低的身分組 / 成員';
  end if;
  delete from totp_accounts x where x.id = p_item;
  perform audit(null, uid, 'site.user.totp.delete', 'user', p_target::text,
                jsonb_build_object('name', display_name(p_target), 'item_id', p_item, 'item_name', a.name));
end;
$$;

-- ============================================================
-- 8. 全站身分組排序（MANAGE_ROLES）：最高位身分組的持有者不受限，其他人（含一般管理員）管不到的不能動
-- ============================================================
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

-- ============================================================
-- 4 / 8. 指派使用者全站身分組（MANAGE_ROLES + 階層）：
--        最高位身分組的持有者不受階層限制；新加入的身分組權限必須是自己權限的子集（ADMINISTRATOR 視為全有）
-- ============================================================
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
  if exists (select 1 from site_roles r where r.id = any (coalesce(added, '{}')) and r.permissions & 1023 & ~mine <> 0) then
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
  end if;
end;
$$;

-- ============================================================
-- 6. 個人加密
-- ============================================================

-- 新增（陣列；每筆可帶 id，沒帶就產生），接在最後；已啟用加密時金鑰必須是 enc:v1: 密文
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
  if exists (select 1 from profiles p where p.id = uid and p.vault is not null)
     and jsonb_typeof(totp_add.items) = 'array'
     and exists (
       select 1 from jsonb_array_elements(totp_add.items) e
       where jsonb_typeof(e) = 'object' and coalesce(e ->> 'secret', '') not like 'enc:v1:%'
     ) then
    raise exception '已啟用金鑰加密，請重新整理並解鎖後再新增';
  end if;
  perform totp_import_items(uid, null, totp_add.items, uid);
  return totp_items_json(uid);
end;
$$;

-- 只改 patch 裡有的欄位；找不到該筆回傳 null；已啟用加密時新的金鑰必須是 enc:v1: 密文
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
  if jsonb_typeof(totp_update.patch) = 'object' and totp_update.patch ? 'secret'
     and coalesce(totp_update.patch ->> 'secret', '') not like 'enc:v1:%'
     and exists (select 1 from profiles p where p.id = uid and p.vault is not null) then
    raise exception '已啟用金鑰加密，請重新整理並解鎖後再修改';
  end if;
  perform totp_apply_patch(target, totp_update.patch);
  return totp_items_json(uid);
end;
$$;

-- 更新 profiles.vault 並一次換掉多筆金鑰（secrets：{ "<id>": "<secret>" }），回傳清單。
-- expected_check：呼叫端以為目前的 vault.check（未啟用為 null）；和資料庫不同代表別的裝置改過，raise。
-- 加密設定有變（啟用、改密碼、停用）時 secrets 必須涵蓋自己全部的驗證碼；
-- 有加密時金鑰都要是 enc:v1: 密文，停用時都要是明文。
drop function if exists public.totp_set_vault(jsonb, jsonb);
create or replace function public.totp_set_vault(new_vault jsonb, secrets jsonb, expected_check text default null)
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
begin
  if uid is null then
    return null;
  end if;
  if v is not null and (jsonb_typeof(v) <> 'object' or coalesce(jsonb_typeof(v -> 'check'), '') <> 'string') then
    raise exception '加密設定格式不正確';
  end if;

  -- 鎖住自己那列：兩台裝置同時送出時，後到的會等前一個完成，再讀到新的 check
  select p.vault into cur from profiles p where p.id = uid for update;
  if (cur ->> 'check') is distinct from totp_set_vault.expected_check then
    raise exception '加密設定已在其他裝置變更，請重新整理';
  end if;

  if (v ->> 'check') is distinct from (cur ->> 'check')
     and exists (select 1 from totp_accounts a where a.owner_id = uid and not (s ? a.id::text)) then
    raise exception '驗證碼清單已在其他裝置變更，請重新整理後再試';
  end if;

  if exists (
    select 1 from totp_accounts a
    where a.owner_id = uid and s ? a.id::text
      and (jsonb_typeof(s -> a.id::text) <> 'string'
           or (v is not null) <> ((s ->> a.id::text) like 'enc:v1:%'))
  ) then
    raise exception '金鑰格式和加密設定不一致，請重新整理後再試';
  end if;

  update profiles
  set vault = v,
      updated_at = now()
  where id = uid;

  update totp_secrets t
  set secret = s ->> a.id::text
  from totp_accounts a
  where a.id = t.account_id
    and a.owner_id = uid
    and s ? a.id::text;

  return totp_items_json(uid);
end;
$$;

-- ============================================================
-- 權限
-- ============================================================
revoke execute on function public.site_is_root(uuid) from public, anon, authenticated;
revoke execute on function public.group_sees_emails(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.totp_set_vault(jsonb, jsonb, text) from public, anon;
grant execute on function public.totp_set_vault(jsonb, jsonb, text) to authenticated;
