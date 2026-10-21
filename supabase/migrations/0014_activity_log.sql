-- ============================================================
-- 使用者的登入紀錄與帳號操作紀錄（0013 之後執行）
-- 1. login_history：每次登入一筆（時間、IP、裝置、user-agent、登入方式），由 /api/record-login 用 service role 寫入。
-- 2. 帳號操作紀錄沿用 audit_logs：跟某位使用者有關的事寫成 group_id null、target_type 'user'、target_id = 使用者 id
--    （所以有 VIEW_AUDIT_LOG 的人在全站操作紀錄也看得到）。由資料庫觸發器 / RPC 寫入，不靠前端：
--    - profiles 觸發器：@ID、名稱、大頭照、背景圖、電話、email（auth 同步）、金鑰加密（啟用 / 改密碼 / 停用 / 忘記密碼重設）、
--      預設群組的變更（舊值 → 新值）；操作者是 auth.uid()，service role / 觸發器裡沒有 uid 時記 null（系統）
--    - 管理員從後台改名稱 / @ID 已由 admin_update_user 記 site.user.update（含舊值新值），觸發器不重複記
--    - 全站身分組：site_set_user_roles 已記 site.user.roles；登入時自動套用的 pending 身分組（apply_pending_roles）
--      改成也記一筆（操作者 null = 系統）
--    - 管理員查看 / 修改 / 刪除 2FA（site.user.totp.*）本來就是 target_type 'user'
--    - 群組相關的沿用群組紀錄：加入 / 離開 / 被移出（target_type 'member'、target_id = 使用者）、
--      自己切換群組加密（group.encryption.*，操作者 = 使用者）
-- 3. 查詢一律走 security definer RPC（兩張表都開 RLS、不建 policy）：
--    my_login_history / my_account_activity：本人；
--    admin_user_login_history / admin_user_activity：VIEW_USERS；管不到的人（階層不比對方高，最高位持有者例外）的 IP 是 null。
--    分頁：before_id = 上一頁最後一筆的 id，page_size 預設 20、上限 100。
-- 4. admin_user_json（後台使用者列表 / 詳情）的 last_login_ip 也照同樣的階層規則遮蔽。
-- 可重複執行。
-- ============================================================

-- ============================================================
-- 資料表
-- ============================================================

-- 登入紀錄（量大，獨立一張表）
create table if not exists public.login_history (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  ip          text,
  device      text,          -- 「OS · 瀏覽器」
  user_agent  text,          -- 完整 user-agent（截斷 512 字）
  provider    text           -- 登入方式：google / email（auth user 的 app_metadata.provider）
);
create index if not exists login_history_user_idx on public.login_history (user_id, created_at desc);

alter table public.login_history enable row level security;
revoke all on table public.login_history from anon, authenticated;
revoke all on sequence public.login_history_id_seq from anon, authenticated;
grant select, insert, delete on table public.login_history to service_role;
grant usage, select on sequence public.login_history_id_seq to service_role;

-- 「跟這位使用者有關的紀錄」查詢用
create index if not exists audit_logs_target_idx on public.audit_logs (target_type, target_id, id desc);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id, id desc);

-- ============================================================
-- 內部 helper
-- ============================================================

-- 目前的操作者：auth.uid()，沒有 profile（或沒有 uid，例如 service role / auth 觸發器）時 null = 系統
create or replace function public.activity_actor()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id from profiles p where p.id = auth.uid();
$$;

-- 寫一筆「跟這位使用者有關」的紀錄（全站、target_type 'user'）；detail 一定帶 name（使用者顯示名稱）
create or replace function public.user_audit(p_target uuid, p_actor uuid, p_action text, p_detail jsonb)
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
create or replace function public.activity_value(v text)
returns text
language sql
immutable
as $$
  select left(nullif(v, ''), 512);
$$;

-- 使用者的操作紀錄分頁：[{ id, actor, action, target_type, target_id, detail, group, created_at }]，id 由大到小
-- site.user.roles 的 detail 另外附上 added_names / removed_names（身分組目前的名稱；已刪除的身分組不列）
create or replace function public.user_activity_page(p_uid uuid, p_before bigint, p_size int, p_with_email boolean)
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
      and (
        (a.target_type = 'user' and a.target_id = p_uid::text and a.action <> 'site.user.delete')
        or (a.target_type = 'member' and a.target_id = p_uid::text
            and a.action in ('group.member.join', 'group.member.leave', 'group.member.kick'))
        or (a.actor_id = p_uid and a.action in ('group.encryption.enable', 'group.encryption.disable'))
      )
    order by a.id desc
    limit greatest(1, least(coalesce(p_size, 20), 100))
  ) l;
$$;

-- 使用者的登入紀錄分頁：[{ id, created_at, ip, device, user_agent, provider }]，新到舊；p_show_ip false 時 ip 是 null
create or replace function public.login_history_page(p_uid uuid, p_before bigint, p_size int, p_show_ip boolean)
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

revoke execute on function public.activity_actor() from public, anon, authenticated;
revoke execute on function public.user_audit(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.activity_value(text) from public, anon, authenticated;
revoke execute on function public.user_activity_page(uuid, bigint, int, boolean) from public, anon, authenticated;
revoke execute on function public.login_history_page(uuid, bigint, int, boolean) from public, anon, authenticated;

-- ============================================================
-- 觸發器：profiles 的變更
-- ============================================================

create or replace function public.profiles_activity()
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

drop trigger if exists profiles_activity on public.profiles;
create trigger profiles_activity
  after update on public.profiles
  for each row execute function public.profiles_activity();

revoke execute on function public.profiles_activity() from public, anon, authenticated;

-- ============================================================
-- 會寫紀錄的既有函式
-- ============================================================

-- 忘記加密密碼：同 0011，另外標記這次停用是「重設」（profiles_activity 記 user.vault.reset）
create or replace function public.vault_reset()
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
end;
$$;

-- 套用 site_pending_roles：同 0009，有指派到身分組時記一筆 site.user.roles（操作者 null = 系統）
create or replace function public.apply_pending_roles(p_uid uuid, p_email text)
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

  if added is not null then
    perform audit(null, null, 'site.user.roles', 'user', p_uid::text, jsonb_build_object(
      'name', coalesce(display_name(p_uid), p_uid::text), 'added', added, 'removed', '{}'::uuid[], 'pending', true));
  end if;
end;
$$;

revoke execute on function public.vault_reset() from public, anon;
grant execute on function public.vault_reset() to authenticated;
revoke execute on function public.apply_pending_roles(uuid, text) from public, anon, authenticated;

-- 後台的使用者資料：同 0011，last_login_ip 只給自己、管得到對方的人（或 service role）
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
    'last_login_ip', case
      when auth.uid() is null or auth.uid() = p.id or site_can_manage_user(auth.uid(), p.id) then p.last_login_ip
    end,
    'last_login_device', p.last_login_device,
    'role_ids', coalesce((
      select jsonb_agg(ur.role_id order by r.position desc)
      from site_user_roles ur join site_roles r on r.id = ur.role_id
      where ur.user_id = p.id and not r.is_default
    ), '[]'::jsonb),
    'top_position', site_top_position(p.id),
    'totp_count', (select count(*) from totp_accounts a where a.group_id = default_group_of(p.id)),
    'vault_enabled', p.vault is not null
  )
  from profiles p
  left join auth.users u on u.id = p.id
  where p.id = p_uid;
$$;

revoke execute on function public.admin_user_json(uuid) from public, anon, authenticated;

-- ============================================================
-- RPC
-- ============================================================

-- 自己的登入紀錄
create or replace function public.my_login_history(before_id bigint, page_size int)
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
create or replace function public.my_account_activity(before_id bigint, page_size int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_uid();
begin
  return user_activity_page(uid, my_account_activity.before_id, my_account_activity.page_size, false);
end;
$$;

-- 使用者的登入紀錄（VIEW_USERS）；管不到對方（階層不比對方高）時 ip 是 null
create or replace function public.admin_user_login_history(user_id uuid, before_id bigint, page_size int)
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
create or replace function public.admin_user_activity(user_id uuid, before_id bigint, page_size int)
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
  return user_activity_page(p_target, admin_user_activity.before_id, admin_user_activity.page_size, true);
end;
$$;

revoke execute on function public.my_login_history(bigint, int) from public, anon;
revoke execute on function public.my_account_activity(bigint, int) from public, anon;
revoke execute on function public.admin_user_login_history(uuid, bigint, int) from public, anon;
revoke execute on function public.admin_user_activity(uuid, bigint, int) from public, anon;
grant execute on function public.my_login_history(bigint, int) to authenticated;
grant execute on function public.my_account_activity(bigint, int) to authenticated;
grant execute on function public.admin_user_login_history(uuid, bigint, int) to authenticated;
grant execute on function public.admin_user_activity(uuid, bigint, int) to authenticated;
