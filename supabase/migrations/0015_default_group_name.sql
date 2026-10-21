-- ============================================================
-- 預設群組改用使用者名稱命名（0014 之後執行）
-- 1. 自動建立的預設群組不再一律叫「我的」，改成「<名稱>的群組」，例如「Andy的群組」。
--    名稱依序取：profiles.name（trim 後非空）→ @ID（profiles.username）→ email 的 @ 前段
--    （profiles.email，沒有就用 auth.users.email）；都沒有就用「我的群組」。
--    連續空白（含換行）收成一個空格；群組名稱上限 50 字（groups.name 的 check），超過時只截名稱、保留「的群組」
--    （名稱部分最多 47 字）。
-- 2. 所有建立預設群組的地方都經過 ensure_default_group（新 profile 觸發器、ensure_profile、legacy 接回、
--    管理員刪掉別人的預設群組時補建、0011 的既有使用者搬移），這裡只改它用 default_group_name(uid) 命名。
-- 3. 既有的預設群組改名：只改「是使用者的預設群組、擁有者是本人、名稱仍是『我的』」的群組，
--    使用者自己改過名的不動。
--    每個被改名的群組在群組操作紀錄寫一筆 group.update（操作者 null = 系統），
--    改完名稱就不再是「我的」，重複執行不會再改、也不會重複記錄。
-- 可重複執行。
-- ============================================================

-- ============================================================
-- 內部 helper
-- ============================================================

-- 預設群組的名稱：「<名稱>的群組」；沒有可用的名稱時「我的群組」
create or replace function public.default_group_name(p_uid uuid)
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

-- 使用者的預設群組；沒有（或指到的群組已不是自己的）就建立一個「<名稱>的群組」並設成預設。沒有 profile 時回傳 null
-- （同 0011，只改群組名稱）
create or replace function public.ensure_default_group(p_uid uuid)
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

revoke execute on function public.default_group_name(uuid) from public, anon, authenticated;
revoke execute on function public.ensure_default_group(uuid) from public, anon, authenticated;

-- ============================================================
-- 既有的預設群組：還叫「我的」的改成「<名稱>的群組」
-- ============================================================
with renamed as (
  update public.groups g
  set name = public.default_group_name(p.id)
  from public.profiles p
  where g.id = p.default_group_id
    and g.owner_id = p.id
    and g.name = '我的'
  returning g.id, g.name
)
insert into public.audit_logs (group_id, actor_id, action, target_type, target_id, detail)
select r.id, null, 'group.update', 'group', r.id::text,
       jsonb_build_object('name', r.name, 'old_name', '我的', 'description_changed', false)
from renamed r;
