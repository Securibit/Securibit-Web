-- ============================================================
-- 全站管理員直接把使用者加進群組（0016 之後執行）
-- 1. group_add_member(gid, target)：不用邀請，直接加入。只有全站 MANAGE_GROUPS 或 ADMINISTRATOR 能用，
--    群組內的管理者（含擁有者）沒有全站權限的不行，他們繼續用邀請連結 / Email 邀請。
--    target 可以是 email、@ID（可帶 @）或使用者 UUID。
--    擋：找不到使用者、已經是成員、加密的群組、對方 email 未驗證（照 0010 的 user_email，只認已驗證的）。
-- 2. 加入後只有 @everyone 的權限（不給身分組）；位置由 0016 的觸發器排在對方清單最後；
--    刪掉這位使用者在此群組待處理的 Email 邀請；寫一筆群組操作紀錄 group.member.add
--    （target_type 'member'、target_id = 加入的使用者，detail 帶 name = 加入者、actor_name = 操作者）。
-- 3. user_activity_page（0014）把 group.member.add 列進「跟這位使用者有關的群組事件」，
--    本人在帳號操作紀錄看得到「管理員 X 把你加入群組「群組名」」。
-- 可重複執行。
-- ============================================================

-- ============================================================
-- RPC
-- ============================================================

-- 直接加入成員（全站 MANAGE_GROUPS / ADMINISTRATOR）：回傳 { id, name }（name 是加入者的顯示名稱）
create or replace function public.group_add_member(gid uuid, target text)
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

  return jsonb_build_object('id', target_uid, 'name', display_name(target_uid));
end;
$$;

-- 使用者的操作紀錄分頁：同 0014，群組事件多列 group.member.add（被管理員直接加入）
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
            and a.action in ('group.member.join', 'group.member.add', 'group.member.leave', 'group.member.kick'))
        or (a.actor_id = p_uid and a.action in ('group.encryption.enable', 'group.encryption.disable'))
      )
    order by a.id desc
    limit greatest(1, least(coalesce(p_size, 20), 100))
  ) l;
$$;

revoke execute on function public.user_activity_page(uuid, bigint, int, boolean) from public, anon, authenticated;
revoke execute on function public.group_add_member(uuid, text) from public, anon;
grant execute on function public.group_add_member(uuid, text) to authenticated;
